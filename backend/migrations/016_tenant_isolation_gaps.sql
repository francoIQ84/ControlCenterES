-- =====================================================================
-- 016_tenant_isolation_gaps.sql — Cerrar los agujeros de aislamiento
-- =====================================================================
--
-- La migración 001 dejó aisladas 23 tablas, pero desde entonces se
-- incorporaron módulos cuyas tablas nacieron sin `tenant_id` o con la
-- columna puesta y la política olvidada. El resultado es que hoy los datos
-- de esas tablas se ven entre negocios distintos:
--
--   * diffusion_groups / _group_members / _campaigns
--       Tienen tenant_id (002) pero NINGUNA política. Son las listas de
--       contactos: teléfonos y correos de los clientes de cada negocio.
--   * meli_questions
--       Sin tenant_id. Preguntas de Mercado Libre, con nickname y id de
--       comprador.
--   * service_payments
--       Sin tenant_id. Los vencimientos de servicios de cada negocio, y el
--       alta automática mensual cuenta filas de todos.
--   * meli_optimizations
--       Sin tenant_id. Auditorías de publicaciones por ml_id.
--   * two_factor_codes
--       Sin tenant_id. Hoy falla cerrado (el token es aleatorio y `users`
--       sí filtra), pero deja el segundo factor fuera del aislamiento.
--   * unlinked_mp_matches
--       Tiene tenant_id pero sin política, sin DEFAULT y sin NOT NULL.
--
-- Además 011, 014 y 015 activaron RLS sin FORCE: el dueño de la tabla evade
-- sus propias políticas. Se completa acá para que la cobertura sea pareja.
--
-- IDEMPOTENTE: puede ejecutarse múltiples veces sin efecto acumulativo.
-- REVERSIBLE: ver 016_tenant_isolation_gaps_rollback.sql
--
-- NO destructiva: todo lo preexistente se asigna al Tenant Maestro, igual
-- que hizo la 001. Ninguna fila se borra ni se mueve de negocio.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columna tenant_id + backfill en las tablas que quedaron afuera
-- ---------------------------------------------------------------------
-- Mismo procedimiento que la 001 §4: nullable -> backfill -> DEFAULT ->
-- NOT NULL -> índice -> FK. En ese orden la tabla no se reescribe entera y
-- no quedan filas huérfanas cuando se aplica el NOT NULL.
DO $$
DECLARE
    t       text;
    master  constant text := '00000000-0000-0000-0000-000000000001';
    tables  constant text[] := ARRAY[
        'diffusion_groups', 'diffusion_group_members', 'diffusion_campaigns',
        'meli_questions', 'service_payments', 'meli_optimizations',
        'two_factor_codes', 'unlinked_mp_matches'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            RAISE NOTICE 'omitida (no existe): %', t;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid', t);
        EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, master);
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT app_current_tenant()', t);
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
                       'idx_' || t || '_tenant_id', t);

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

        RAISE NOTICE 'tenant_id asegurado en %', t;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 2. two_factor_codes: reasignar cada código a su usuario real
-- ---------------------------------------------------------------------
-- El backfill del punto 1 mandó todo al Maestro. Acá se corrige usando el
-- dueño verdadero, que ya está en `users`. Son códigos de 10 minutos: en la
-- práctica la tabla está casi vacía, pero dejarlo mal asignado rompería la
-- verificación en curso de quien esté logueándose justo en este momento.
DO $$
BEGIN
    IF to_regclass('public.two_factor_codes') IS NULL THEN
        RETURN;
    END IF;
    UPDATE two_factor_codes c
    SET tenant_id = u.tenant_id
    FROM users u
    WHERE u.id = c.user_id
      AND c.tenant_id IS DISTINCT FROM u.tenant_id;
END $$;


-- ---------------------------------------------------------------------
-- 3. Claves naturales -> claves compuestas por tenant
-- ---------------------------------------------------------------------
-- Sin esto, dos negocios no podrían recibir la misma pregunta de Mercado
-- Libre (imposible hoy, pero el UNIQUE global convierte cualquier colisión
-- futura en un error de inserción silencioso) y, sobre todo, el
-- ON CONFLICT de la aplicación apuntaría a una clave equivocada.
DO $$
DECLARE
    spec  record;
    specs constant text[][] := ARRAY[
        -- tabla,             constraint,                      tipo, columnas
        ['meli_questions',    'meli_questions_question_id_key', 'u', 'tenant_id, question_id']
    ];
BEGIN
    FOR spec IN SELECT specs[i][1] AS tbl, specs[i][2] AS con,
                       specs[i][3] AS kind, specs[i][4] AS cols
                FROM generate_subscripts(specs, 1) AS i
    LOOP
        IF to_regclass('public.' || quote_ident(spec.tbl)) IS NULL THEN
            CONTINUE;
        END IF;

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

-- unlinked_mp_matches nació con la PK ya compuesta en las instalaciones
-- nuevas, pero las que vienen de antes la tienen sin tenant_id.
DO $$
BEGIN
    IF to_regclass('public.unlinked_mp_matches') IS NULL THEN
        RETURN;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unlinked_mp_matches_pkey'
          AND conrelid = 'public.unlinked_mp_matches'::regclass
          AND array_length(conkey, 1) = 2
    ) THEN
        ALTER TABLE unlinked_mp_matches DROP CONSTRAINT unlinked_mp_matches_pkey;
        ALTER TABLE unlinked_mp_matches
            ADD CONSTRAINT unlinked_mp_matches_pkey
            PRIMARY KEY (tenant_id, order_id, mp_payment_id);
        RAISE NOTICE 'PK de unlinked_mp_matches recompuesta con tenant_id';
    END IF;
END $$;

-- Índices de acceso habitual, ya con el tenant al frente. `meli_optimizations`
-- la crea la aplicación de forma perezosa (_ensure_optimizer_tables), así que
-- todos van condicionados a que la tabla exista en este entorno.
DO $$
BEGIN
    IF to_regclass('public.meli_optimizations') IS NOT NULL THEN
        -- El upsert de la aplicación borra por (ml_id, opt_type): sin este
        -- índice cada guardado degrada a seq scan sobre todos los tenants.
        CREATE INDEX IF NOT EXISTS idx_meli_optimizations_lookup
            ON meli_optimizations (tenant_id, ml_id, opt_type);
    END IF;
    IF to_regclass('public.meli_questions') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_meli_questions_status
            ON meli_questions (tenant_id, status);
    END IF;
    IF to_regclass('public.service_payments') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_service_payments_period
            ON service_payments (tenant_id, period_year, period_month);
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 4. Row Level Security sobre todo lo que tenga tenant_id
-- ---------------------------------------------------------------------
-- Se enumeran las tablas nuevas y se re-aplica FORCE sobre las que 011, 014
-- y 015 habían dejado a medias. Es idempotente: DROP POLICY IF EXISTS +
-- CREATE deja siempre la misma política.
DO $$
DECLARE
    t      text;
    tables constant text[] := ARRAY[
        -- Las que no tenían política ninguna
        'diffusion_groups', 'diffusion_group_members', 'diffusion_campaigns',
        'meli_questions', 'service_payments', 'meli_optimizations',
        'two_factor_codes', 'unlinked_mp_matches',
        -- Las que tenían política pero sin FORCE
        'listing_health', 'listing_suggestions', 'listing_revisions',
        'quotes', 'integration_sync_state', 'integration_sync_log'
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
        RAISE NOTICE 'RLS + FORCE aplicado a %', t;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 5. Permisos del rol de aplicación
-- ---------------------------------------------------------------------
-- Las tablas creadas después de la 001 heredan los permisos por
-- ALTER DEFAULT PRIVILEGES, pero solo si las creó el mismo rol que lo
-- configuró. Se re-otorga explícitamente para no depender de eso.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO controlcenter_app;
        GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO controlcenter_app;
        -- El DELETE sobre tenants sigue siendo cosa de DBA (ver 001 §7).
        REVOKE DELETE ON tenants FROM controlcenter_app;
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 6. Dominio propio por inquilino
-- ---------------------------------------------------------------------
-- El resolver solo entendía `{slug}.controlcenter.app`. Cualquier otro host
-- —justamente el dominio propio que se le vende al cliente con el módulo
-- "Tienda Web"— no identificaba a nadie y caía al Tenant Maestro, así que la
-- tienda del cliente servía el catálogo de Hidroponía.
--
-- UNIQUE porque un dominio no puede apuntar a dos negocios: si pasara, cuál
-- gana dependería del orden de las filas.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_custom_domain_key'
    ) THEN
        ALTER TABLE tenants ADD CONSTRAINT tenants_custom_domain_key
            UNIQUE (custom_domain);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain
    ON tenants (custom_domain) WHERE custom_domain IS NOT NULL;

COMMENT ON COLUMN tenants.custom_domain IS
    'Dominio propio del negocio (ej. tiendadelcliente.com), en minúsculas y '
    'sin protocolo ni www. El TenantResolver lo consulta cuando el Host no es '
    'un subdominio de la plataforma.';


-- ---------------------------------------------------------------------
-- 7. Topes del plan contratado
-- ---------------------------------------------------------------------
-- El panel de alta vende "Hasta 150 productos", "Hasta 3 usuarios" y demás,
-- pero no existía ninguna columna donde anotarlos ni nada que los leyera: los
-- límites eran texto de marketing.
--
-- `{}` significa sin tope, que es el comportamiento actual. Ningún negocio
-- existente cambia de conducta al aplicar esta migración; los topes empiezan a
-- regir recién cuando la administración de plataforma los carga.
ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS plan_limits JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenant_settings.plan_limits IS
    'Topes del plan, ej. {"products": 150, "users": 3}. Clave ausente, nula o '
    '<= 0 significa sin tope. El Tenant Maestro nunca tiene tope.';


-- ---------------------------------------------------------------------
-- 8. Registro de cuentas externas ya vinculadas
-- ---------------------------------------------------------------------
-- `app_resolve_tenant_by_account` es lo que le permite a un webhook entrante
-- saber de quién es el aviso, pero solo encuentra al inquilino si hay una fila
-- en tenant_integrations con su external_account_id. Hasta ahora el alta de
-- Mercado Libre guardaba el user_id en `settings` y nunca creaba esa fila, así
-- que la resolución devolvía NULL para todos.
--
-- Acá se siembra a partir de lo que ya está en `settings`, para que los
-- negocios vinculados hoy no tengan que volver a autorizar la app.
--
-- Se hace con una función SECURITY DEFINER temporal porque `settings` tiene
-- RLS: recorrer los valores de todos los inquilinos desde una sesión normal
-- no devolvería nada.
CREATE OR REPLACE FUNCTION app_seed_tenant_accounts() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec   record;
    total integer := 0;
BEGIN
    FOR rec IN
        SELECT s.tenant_id,
               CASE s.key WHEN 'meli_user_id' THEN 'mercadolibre'
                          WHEN 'mp_user_id'   THEN 'mercadopago' END AS provider,
               s.value AS account_id
        FROM settings s
        WHERE s.key IN ('meli_user_id', 'mp_user_id')
          AND COALESCE(s.value, '') <> ''
    LOOP
        INSERT INTO tenant_integrations
            (tenant_id, provider, external_account_id, is_active, updated_at)
        VALUES (rec.tenant_id, rec.provider, rec.account_id, TRUE, CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id, provider) DO UPDATE SET
            -- Solo completa lo que falta: si ya había un id registrado, ese
            -- manda. `settings` puede tener un valor viejo de una cuenta que
            -- se desvinculó y volvió a vincular.
            external_account_id = COALESCE(tenant_integrations.external_account_id,
                                           EXCLUDED.external_account_id),
            updated_at          = CURRENT_TIMESTAMP;
        total := total + 1;
    END LOOP;
    RETURN total;
END $$;

DO $$
DECLARE n integer;
BEGIN
    SELECT app_seed_tenant_accounts() INTO n;
    RAISE NOTICE 'cuentas externas registradas/confirmadas: %', n;
END $$;

-- La función era solo para esta siembra: no queda disponible para nadie.
DROP FUNCTION IF EXISTS app_seed_tenant_accounts();


-- ---------------------------------------------------------------------
-- 9. Tablas deliberadamente globales
-- ---------------------------------------------------------------------
-- Se documentan en el esquema para que la auditoría (`--verify`) y quien
-- lea esto dentro de seis meses sepan que la ausencia de RLS es una
-- decisión y no un olvido.
COMMENT ON TABLE tenants IS
    'GLOBAL POR DISEÑO: registro de ruteo. El TenantResolver tiene que leerlo '
    'ANTES de saber quién es el inquilino, así que no puede llevar RLS. '
    'Se restringe por GRANTs (sin DELETE para el rol de aplicación).';

DO $$
BEGIN
    IF to_regclass('public.tenant_subscription_payments') IS NOT NULL THEN
        EXECUTE $c$COMMENT ON TABLE tenant_subscription_payments IS
            'GLOBAL POR DISEÑO: cobros de la plataforma a sus inquilinos, no '
            'datos del inquilino. La administración de plataforma los consulta '
            'de todos los negocios desde el contexto del Maestro; con RLS solo '
            'vería los propios. Protegida por require_platform_admin.'$c$;
    END IF;
    IF to_regclass('public.meli_category_attrs_cache') IS NOT NULL THEN
        EXECUTE $c$COMMENT ON TABLE meli_category_attrs_cache IS
            'GLOBAL POR DISEÑO: copia local de los atributos públicos de las '
            'categorías de Mercado Libre. Son idénticos para todos y no '
            'contienen dato alguno del inquilino; duplicarlos por tenant solo '
            'multiplicaría las llamadas a la API.'$c$;
    END IF;
END $$;

COMMIT;
