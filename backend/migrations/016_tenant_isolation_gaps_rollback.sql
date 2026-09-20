-- =====================================================================
-- 016_tenant_isolation_gaps_rollback.sql — Marcha atrás de la 016
-- =====================================================================
--
-- Quita las políticas y el FORCE que agregó la 016 y devuelve las
-- constraints compuestas a su forma anterior.
--
-- NO borra la columna `tenant_id` ni los datos. Es deliberado: si hay más de
-- un negocio cargado, quitar el discriminador mezcla irreversiblemente los
-- datos de clientes distintos. La columna queda, inofensiva; lo único que se
-- revierte es el filtrado.
--
-- Después de correr esto, las tablas vuelven a verse entre inquilinos. Usarlo
-- solo si la 016 rompiera algo en producción y haga falta volver al
-- comportamiento anterior mientras se investiga.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Quitar las políticas de las tablas que la 016 incorporó
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t      text;
    tables constant text[] := ARRAY[
        'diffusion_groups', 'diffusion_group_members', 'diffusion_campaigns',
        'meli_questions', 'service_payments', 'meli_optimizations',
        'two_factor_codes', 'unlinked_mp_matches'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
        -- La columna y el NOT NULL se conservan (ver cabecera). Solo se suelta
        -- el NOT NULL para no romper inserciones que no la mencionen si además
        -- se revirtiera la 001 y desapareciera app_current_tenant().
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id DROP NOT NULL', t);
        RAISE NOTICE 'RLS retirado de %', t;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 2. Devolver el FORCE a como lo dejaron 011, 014 y 015
-- ---------------------------------------------------------------------
-- Sus políticas se conservan: no las creó la 016. Solo se deshace el FORCE,
-- que es lo único que esta migración les agregó.
DO $$
DECLARE
    t      text;
    tables constant text[] := ARRAY[
        'listing_health', 'listing_suggestions', 'listing_revisions',
        'quotes', 'integration_sync_state', 'integration_sync_log'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. Restituir la clave única simple de meli_questions
-- ---------------------------------------------------------------------
-- Solo es posible si no hay un mismo question_id en dos negocios. Si lo
-- hubiera, la constraint no se puede recrear y se deja compuesta: es
-- preferible eso a borrar filas de alguien.
DO $$
BEGIN
    IF to_regclass('public.meli_questions') IS NULL THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'meli_questions_question_id_key'
          AND conrelid = 'public.meli_questions'::regclass
          AND array_length(conkey, 1) = 2
    ) THEN
        IF EXISTS (
            SELECT 1 FROM meli_questions
            GROUP BY question_id HAVING count(*) > 1
        ) THEN
            RAISE NOTICE 'meli_questions: hay question_id repetidos entre negocios; '
                         'la clave queda compuesta (no se pierde ningún dato).';
        ELSE
            ALTER TABLE meli_questions DROP CONSTRAINT meli_questions_question_id_key;
            ALTER TABLE meli_questions
                ADD CONSTRAINT meli_questions_question_id_key UNIQUE (question_id);
        END IF;
    END IF;
END $$;

COMMIT;
