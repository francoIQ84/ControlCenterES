-- =====================================================================
-- 001_multitenancy.sql — Fase 2: cimientos Multi-Tenant nativos
-- =====================================================================
--
-- Convierte el esquema mono-tenant de ControlCenter en Shared Database /
-- Shared Schema con aislamiento por Row Level Security (RLS).
--
-- PRINCIPIO RECTOR (Regla de Oro): esta migración NO reescribe la operación
-- existente. Todos los datos actuales quedan asignados al "Tenant Maestro"
-- (Hidroponía Rosario) y las ~242 consultas SQL del backend siguen
-- funcionando sin modificarse, porque:
--
--   a) tenant_id tiene DEFAULT app_current_tenant()  -> los INSERT existentes
--      que no mencionan tenant_id reciben el tenant correcto en runtime.
--   b) Las políticas RLS filtran los SELECT/UPDATE/DELETE existentes
--      automáticamente contra la variable de sesión app.current_tenant.
--
-- IDEMPOTENTE: puede ejecutarse múltiples veces sin efecto acumulativo.
-- REVERSIBLE: ver 001_multitenancy_rollback.sql
--
-- REQUISITO: ejecutar database.init_db() ANTES, para que todas las tablas
-- existan (el runner lo hace automáticamente).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Resolución del tenant activo
-- ---------------------------------------------------------------------
-- Lee la variable de sesión app.current_tenant que inyecta el TenantResolver
-- en cada conexión. Si no está definida, cae al valor de app.default_tenant.
--
-- MODO FAIL-OPEN (por defecto): app.default_tenant se fija a nivel de base de
--   datos apuntando al Tenant Maestro. Cualquier código que todavía no propague
--   contexto (scheduler, scripts de mantenimiento, webhooks) sigue viendo los
--   datos de Hidroponía exactamente como hoy. Esto es lo que garantiza que la
--   operación en producción no se interrumpa.
--
-- MODO FAIL-CLOSED (recomendado una vez que todos los jobs propaguen contexto):
--   ALTER DATABASE controlcenter RESET app.default_tenant;
--   A partir de ahí, sin contexto explícito la función devuelve NULL, ninguna
--   política RLS matchea y no se lee ni escribe absolutamente nada.
--   No requiere cambiar una sola línea de código de la aplicación.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        NULLIF(current_setting('app.current_tenant', true), '')::uuid,
        NULLIF(current_setting('app.default_tenant', true), '')::uuid
    );
$$;

COMMENT ON FUNCTION app_current_tenant() IS
    'Devuelve el tenant activo de la sesión. Base de las políticas RLS y del DEFAULT de tenant_id.';


-- ---------------------------------------------------------------------
-- 2. Tablas núcleo del sistema SaaS
-- ---------------------------------------------------------------------
-- NOTA: `tenants` NO lleva RLS. Es el registro de ruteo que el
-- TenantResolver debe poder consultar ANTES de conocer el tenant.
-- El acceso se restringe por GRANTs (solo SELECT para el rol de aplicación).
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        VARCHAR(63) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    cuit        VARCHAR(20),
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    plan_id     VARCHAR(50) DEFAULT 'starter',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
    CONSTRAINT tenants_slug_format  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON tenants (slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

-- Configuración y personalización por tenant (Regla: cero valores hardcodeados)
CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    logo_url        TEXT,
    primary_color   VARCHAR(20)  DEFAULT '#16a34a',
    currency        VARCHAR(10)  DEFAULT 'ARS',
    timezone        VARCHAR(64)  DEFAULT 'America/Argentina/Buenos_Aires',
    active_modules  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Credenciales de integraciones externas. credentials_encrypted guarda el
-- payload cifrado con AES-256 (la app nunca persiste secretos en claro acá).
CREATE TABLE IF NOT EXISTS tenant_integrations (
    id                    SERIAL PRIMARY KEY,
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider              VARCHAR(50) NOT NULL,
    credentials_encrypted TEXT,
    -- Identificador PÚBLICO de la cuenta en el proveedor (ml_user_id,
    -- mp_user_id, page_id de Meta, CUIT). No es un secreto: se guarda en claro
    -- porque hay que poder buscar por él para resolver webhooks entrantes.
    external_account_id   VARCHAR(255),
    is_active             BOOLEAN NOT NULL DEFAULT FALSE,
    last_sync_at          TIMESTAMP,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tenant_integrations_provider_check
        CHECK (provider IN ('mercadolibre', 'mercadopago', 'afip', 'meta', 'google', 'whatsapp')),
    CONSTRAINT tenant_integrations_unique UNIQUE (tenant_id, provider)
);

ALTER TABLE tenant_integrations
    ADD COLUMN IF NOT EXISTS external_account_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_provider
    ON tenant_integrations (provider, is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_account
    ON tenant_integrations (provider, external_account_id);


-- Resolución de webhooks entrantes.
--
-- Cuando Mercado Libre avisa de una venta, el POST trae un ml_user_id pero
-- ningún subdominio: hay que averiguar a qué tenant pertenece esa cuenta
-- ANTES de tener contexto de tenant. Con RLS activo esa búsqueda no puede
-- hacerse desde la aplicación, porque justamente tendría que mirar filas de
-- todos los tenants.
--
-- SECURITY DEFINER hace que la función corra con los privilegios de su dueño
-- (postgres) y por lo tanto atraviese RLS. Es deliberadamente angosta: recibe
-- proveedor y id de cuenta, devuelve un UUID y nada más. No expone
-- credenciales ni permite enumerar tenants.
CREATE OR REPLACE FUNCTION app_resolve_tenant_by_account(
    p_provider   text,
    p_account_id text
) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ti.tenant_id
    FROM tenant_integrations ti
    JOIN tenants t ON t.id = ti.tenant_id
    WHERE ti.provider = p_provider
      AND ti.external_account_id = p_account_id
      AND ti.is_active
      AND t.status IN ('active', 'trial')
    LIMIT 1;
$$;


-- ---------------------------------------------------------------------
-- 3. Tenant Maestro — la operación actual de Hidroponía Rosario
-- ---------------------------------------------------------------------
-- UUID fijo y conocido: debe coincidir con MASTER_TENANT_ID en src/tenancy.py
INSERT INTO tenants (id, slug, name, status, plan_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'hidroponia',
        'Hidroponía Rosario', 'active', 'master')
ON CONFLICT (id) DO NOTHING;

-- El Tenant Maestro tiene TODOS los módulos: es la operación completa que ya
-- estaba funcionando. Omitir uno acá lo haría desaparecer del panel, porque el
-- frontend esconde lo que no figura en esta lista.
INSERT INTO tenant_settings (tenant_id, active_modules)
VALUES ('00000000-0000-0000-0000-000000000001',
        '["dashboard","inventory","sales","billing","expenses","customers",
          "media","settings","inpi","marketing","whatsapp","storefront",
          "blog"]'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

-- Corrección idempotente para instalaciones que aplicaron una versión previa
-- de esta migración, cuando la lista sembrada no incluía "dashboard".
UPDATE tenant_settings
SET active_modules = active_modules || '["dashboard"]'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND NOT (active_modules @> '["dashboard"]'::jsonb);

-- Fail-open al Tenant Maestro mientras dure la transición (ver punto 1).
-- Se aplica a nivel de base de datos: toda conexión nueva lo hereda.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET app.default_tenant = %L',
                   current_database(), '00000000-0000-0000-0000-000000000001');
END $$;


-- ---------------------------------------------------------------------
-- 4. Columna tenant_id + backfill en todas las tablas operacionales
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t       text;
    master  constant text := '00000000-0000-0000-0000-000000000001';
    tables  constant text[] := ARRAY[
        'settings', 'products_cache', 'categories', 'web_visits_log',
        'orders_cache', 'deleted_mp_expenses', 'customers', 'users',
        'active_sessions', 'login_history', 'fixed_expenses',
        'variable_expenses', 'incomes', 'whatsapp_chat_history',
        'whatsapp_product_inquiries', 'whatsapp_paused_chats',
        'blog_posts', 'leads', 'monitored_trademarks', 'marketing_posts',
        -- Reglas de publicación automática. No la crea init_db() ni la usa
        -- código alguno hoy: quedó de una versión anterior del módulo de
        -- marketing y solo existe en producción. Se incluye igual para que
        -- nazca aislada si esa funcionalidad vuelve.
        'marketing_rules'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Salta tablas que todavía no existan en este entorno (drift de esquema)
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'omitida (no existe): %', t;
            CONTINUE;
        END IF;

        -- 4.a Columna nullable primero (no reescribe la tabla)
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', t);

        -- 4.b Backfill: todo lo preexistente pertenece al Tenant Maestro
        EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, master);

        -- 4.c DEFAULT dinámico: hace que los INSERT existentes sigan andando
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT app_current_tenant()', t);

        -- 4.d Recién ahora NOT NULL (ya no hay filas huérfanas)
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);

        -- 4.e Índice de segregación
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
                       'idx_' || t || '_tenant_id', t);

        -- 4.f Integridad referencial contra el registro de tenants
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = t || '_tenant_id_fkey'
              AND conrelid = ('public.' || quote_ident(t))::regclass
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I
                 FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
                t, t || '_tenant_id_fkey');
        END IF;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 5. Claves naturales -> claves compuestas por tenant
-- ---------------------------------------------------------------------
-- Sin esto, dos tenants no podrían tener un usuario "admin", una categoría
-- "Sustratos", un producto LOCAL-1 o un mismo lead. Solo se tocan las claves
-- que colisionan de verdad; los PK SERIAL quedan intactos (ya son únicos
-- globalmente) para no romper las FK existentes.
DO $$
DECLARE
    spec  record;
    specs constant text[][] := ARRAY[
        -- tabla,                       constraint,                  tipo, columnas
        ['settings',              'settings_pkey',              'p', 'tenant_id, key'],
        ['products_cache',        'products_cache_pkey',        'p', 'tenant_id, ml_id'],
        ['orders_cache',          'orders_cache_pkey',          'p', 'tenant_id, order_id'],
        ['customers',             'customers_pkey',             'p', 'tenant_id, buyer_id'],
        ['whatsapp_paused_chats', 'whatsapp_paused_chats_pkey', 'p', 'tenant_id, sender'],
        ['deleted_mp_expenses',   'deleted_mp_expenses_pkey',   'p', 'tenant_id, mp_payment_id'],
        ['users',                 'users_username_key',         'u', 'tenant_id, username'],
        ['categories',            'categories_name_key',        'u', 'tenant_id, name'],
        ['categories',            'categories_slug_key',        'u', 'tenant_id, slug'],
        ['blog_posts',            'blog_posts_slug_key',        'u', 'tenant_id, slug'],
        ['leads',                 'leads_email_key',            'u', 'tenant_id, email'],
        ['monitored_trademarks',  'monitored_trademarks_acta_key', 'u', 'tenant_id, acta']
    ];
BEGIN
    FOR spec IN SELECT specs[i][1] AS tbl, specs[i][2] AS con,
                       specs[i][3] AS kind, specs[i][4] AS cols
                FROM generate_subscripts(specs, 1) AS i
    LOOP
        IF to_regclass('public.' || quote_ident(spec.tbl)) IS NULL THEN
            CONTINUE;
        END IF;

        -- Solo actuar si la constraint sigue siendo de una sola columna.
        -- Si ya es compuesta, la migración ya corrió: no hacer nada.
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = spec.con
              AND conrelid = ('public.' || quote_ident(spec.tbl))::regclass
              AND array_length(conkey, 1) = 1
        ) THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', spec.tbl, spec.con);
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s (%s)',
                           spec.tbl, spec.con,
                           CASE spec.kind WHEN 'p' THEN 'PRIMARY KEY' ELSE 'UNIQUE' END,
                           spec.cols);
            RAISE NOTICE 'constraint recompuesta: %.% -> (%)', spec.tbl, spec.con, spec.cols;
        END IF;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
-- FORCE es indispensable: sin él, el dueño de la tabla evade sus propias
-- políticas. (Aun así, un SUPERUSER las evade siempre — por eso el punto 7.)
DO $$
DECLARE
    t      text;
    tables constant text[] := ARRAY[
        'settings', 'products_cache', 'categories', 'web_visits_log',
        'orders_cache', 'deleted_mp_expenses', 'customers', 'users',
        'active_sessions', 'login_history', 'fixed_expenses',
        'variable_expenses', 'incomes', 'whatsapp_chat_history',
        'whatsapp_product_inquiries', 'whatsapp_paused_chats',
        'blog_posts', 'leads', 'monitored_trademarks', 'marketing_posts',
        'marketing_rules', 'tenant_settings', 'tenant_integrations'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I
                 USING       (tenant_id = app_current_tenant())
                 WITH CHECK  (tenant_id = app_current_tenant())', t);
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 7. Rol de aplicación (NO superusuario)
-- ---------------------------------------------------------------------
-- PostgreSQL ignora RLS por completo para superusuarios y para roles con
-- BYPASSRLS. Hoy la app conecta como `postgres` (superusuario), así que las
-- políticas del punto 6 no la afectarían: el aislamiento sería ficticio.
--
-- El rol se crea acá SIN contraseña; el runner (run_migration.py) la asigna
-- desde la variable de entorno APP_DB_PASSWORD para no versionar secretos.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app') THEN
        CREATE ROLE controlcenter_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        RAISE NOTICE 'rol controlcenter_app creado (sin contraseña todavía)';
    END IF;
END $$;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO controlcenter_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO controlcenter_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO controlcenter_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO controlcenter_app;
GRANT EXECUTE                        ON FUNCTION app_current_tenant() TO controlcenter_app;
GRANT EXECUTE                        ON FUNCTION app_resolve_tenant_by_account(text, text) TO controlcenter_app;

-- El alta y la suspensión de tenants las hace la API de plataforma, protegida
-- por `require_platform_admin`. El DELETE queda fuera a propósito: borrar un
-- tenant cascadea sobre todos sus datos operativos, así que debe ser una
-- operación manual y deliberada de DBA, no algo que un bug de la API pueda
-- provocar.
REVOKE DELETE ON tenants FROM controlcenter_app;

-- Que las tablas futuras hereden los permisos automáticamente
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO controlcenter_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO controlcenter_app;

COMMIT;
