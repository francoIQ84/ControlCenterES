-- =====================================================================
-- 001_multitenancy_rollback.sql — revierte 001_multitenancy.sql
-- =====================================================================
--
-- Devuelve el esquema al estado mono-tenant original. Pensado como red de
-- contención si algo falla en producción: quita RLS, restaura las claves
-- naturales simples y elimina las columnas tenant_id.
--
-- PRESERVA LOS DATOS OPERACIONALES. Solo es seguro mientras exista un único
-- tenant. Si ya hay más de uno cargado, el script aborta: revertir borraría
-- la única cosa que distingue las filas de un inquilino de las de otro.
--
-- Las tablas tenants / tenant_settings / tenant_integrations se conservan
-- (no molestan y evitan perder la configuración del onboarding). Para
-- eliminarlas, ver el bloque comentado del final.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Guarda de seguridad
-- ---------------------------------------------------------------------
DO $$
DECLARE
    n integer;
BEGIN
    IF to_regclass('public.tenants') IS NULL THEN
        RAISE EXCEPTION 'No hay nada que revertir: la tabla tenants no existe.';
    END IF;

    SELECT count(*) INTO n FROM tenants;
    IF n > 1 THEN
        RAISE EXCEPTION
            'ABORTADO: hay % tenants cargados. Revertir eliminaría tenant_id y '
            'mezclaría irreversiblemente los datos de todos los inquilinos. '
            'Migrá o eliminá los tenants adicionales antes de revertir.', n;
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 1. Quitar políticas RLS
-- ---------------------------------------------------------------------
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
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 2. Restaurar claves naturales simples
-- ---------------------------------------------------------------------
DO $$
DECLARE
    spec  record;
    specs constant text[][] := ARRAY[
        ['settings',              'settings_pkey',              'p', 'key'],
        ['products_cache',        'products_cache_pkey',        'p', 'ml_id'],
        ['orders_cache',          'orders_cache_pkey',          'p', 'order_id'],
        ['customers',             'customers_pkey',             'p', 'buyer_id'],
        ['whatsapp_paused_chats', 'whatsapp_paused_chats_pkey', 'p', 'sender'],
        ['deleted_mp_expenses',   'deleted_mp_expenses_pkey',   'p', 'mp_payment_id'],
        ['users',                 'users_username_key',         'u', 'username'],
        ['categories',            'categories_name_key',        'u', 'name'],
        ['categories',            'categories_slug_key',        'u', 'slug'],
        ['blog_posts',            'blog_posts_slug_key',        'u', 'slug'],
        ['leads',                 'leads_email_key',            'u', 'email'],
        ['monitored_trademarks',  'monitored_trademarks_acta_key', 'u', 'acta']
    ];
BEGIN
    FOR spec IN SELECT specs[i][1] AS tbl, specs[i][2] AS con,
                       specs[i][3] AS kind, specs[i][4] AS cols
                FROM generate_subscripts(specs, 1) AS i
    LOOP
        IF to_regclass('public.' || quote_ident(spec.tbl)) IS NULL THEN CONTINUE; END IF;

        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = spec.con
              AND conrelid = ('public.' || quote_ident(spec.tbl))::regclass
              AND array_length(conkey, 1) = 2
        ) THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', spec.tbl, spec.con);
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s (%s)',
                           spec.tbl, spec.con,
                           CASE spec.kind WHEN 'p' THEN 'PRIMARY KEY' ELSE 'UNIQUE' END,
                           spec.cols);
        END IF;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. Eliminar columnas tenant_id (FK e índices caen en cascada)
-- ---------------------------------------------------------------------
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
        'marketing_rules'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN CONTINUE; END IF;
        EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS tenant_id', t);
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 4. Limpiar configuración de sesión
-- ---------------------------------------------------------------------
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I RESET app.default_tenant', current_database());
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- Limpieza opcional (ejecutar aparte y a conciencia)
-- ---------------------------------------------------------------------
-- DROP TABLE IF EXISTS tenant_integrations, tenant_settings, tenants CASCADE;
-- DROP FUNCTION IF EXISTS app_current_tenant();
-- DROP ROLE IF EXISTS controlcenter_app;
