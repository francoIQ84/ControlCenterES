-- =====================================================================
-- 011_listing_optimizer.sql — Optimizador de publicaciones de Mercado Libre
-- =====================================================================
--
-- Tres tablas para auditar y mejorar publicaciones:
--   listing_health      diagnóstico vigente (puntaje + objetivos + ficha técnica)
--   listing_suggestions borradores generados por IA, pendientes de revisión
--   listing_revisions   historial de lo aplicado, para poder volver atrás
--
-- Notas de diseño:
--
--   * La respuesta de la API de calidad se guarda CRUDA en goals_json. El
--     formato lo define Mercado Libre y ya lo cambiaron una vez (el endpoint
--     /health quedó reemplazado por /performance), así que el esquema no se
--     casa con ninguna estructura en particular: el parseo vive en el código.
--
--   * La PK de products_cache es compuesta (tenant_id, ml_id) desde la
--     migración 001, por lo que las FK hacia ella también lo son.
--
--   * RLS explícito en cada tabla nueva. El loop de la 001 solo alcanzó a las
--     tablas que existían en ese momento; las creadas después quedan sin
--     aislamiento si no se declara acá.
--
-- Idempotente: se puede correr más de una vez sin efecto adicional.
-- Reversible: ver 011_listing_optimizer_rollback.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Diagnóstico vigente por publicación
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_health (
    ml_id            TEXT NOT NULL,
    tenant_id        uuid DEFAULT app_current_tenant(),
    health_score     REAL,
    health_level     VARCHAR(30),
    pending_goals    INTEGER DEFAULT 0,
    goals_json       TEXT DEFAULT '[]',
    attributes_json  TEXT DEFAULT '[]',
    category_id      TEXT,
    source           VARCHAR(30),
    calculated_at    TEXT,
    fetched_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, ml_id)
);

COMMENT ON COLUMN listing_health.goals_json IS
    'Respuesta cruda de la API de calidad de Mercado Libre (los "buckets" con sus '
    'variables, cumplidos y pendientes). El parseo vive en el código.';
COMMENT ON COLUMN listing_health.pending_goals IS
    'Cantidad de objetivos pendientes, desnormalizada del JSON para poder ordenar '
    'el inventario por "peor calidad primero" sin parsear en SQL.';
COMMENT ON COLUMN listing_health.calculated_at IS
    'Momento en que Mercado Libre calculó el puntaje, distinto de cuándo lo trajimos.';
COMMENT ON COLUMN listing_health.source IS
    'Endpoint del que salió el dato, para poder migrar sin perder trazabilidad.';

-- ---------------------------------------------------------------------
-- 2. Borradores generados por IA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_suggestions (
    id              SERIAL PRIMARY KEY,
    tenant_id       uuid DEFAULT app_current_tenant(),
    ml_id           TEXT NOT NULL,
    field           VARCHAR(50) NOT NULL,
    goal_code       VARCHAR(100),
    current_value   TEXT,
    proposed_value  TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    reject_reason   TEXT,
    model_used      VARCHAR(50),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    applied_at      TIMESTAMP,
    CONSTRAINT listing_suggestions_field_check
        CHECK (field IN ('title', 'attributes', 'description')),
    CONSTRAINT listing_suggestions_status_check
        CHECK (status IN ('draft', 'edited', 'applied', 'discarded', 'failed'))
);

COMMENT ON COLUMN listing_suggestions.reject_reason IS
    'Motivo por el que la validación previa descartó el borrador (status = failed).';

-- ---------------------------------------------------------------------
-- 3. Historial de cambios aplicados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_revisions (
    id              SERIAL PRIMARY KEY,
    tenant_id       uuid DEFAULT app_current_tenant(),
    ml_id           TEXT NOT NULL,
    field           VARCHAR(50) NOT NULL,
    previous_value  TEXT NOT NULL,
    applied_value   TEXT NOT NULL,
    suggestion_id   INTEGER REFERENCES listing_suggestions(id) ON DELETE SET NULL,
    applied_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reverted_at     TIMESTAMP
);

COMMENT ON COLUMN listing_revisions.previous_value IS
    'Valor leído de Mercado Libre en el momento de aplicar, no del cache local: '
    'un rollback con datos desactualizados sería peor que el problema original.';

-- ---------------------------------------------------------------------
-- 4. Índices
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_listing_health_score
    ON listing_health (tenant_id, health_score);
CREATE INDEX IF NOT EXISTS idx_listing_suggestions_lookup
    ON listing_suggestions (tenant_id, ml_id, status);
CREATE INDEX IF NOT EXISTS idx_listing_revisions_lookup
    ON listing_revisions (tenant_id, ml_id, reverted_at);

-- ---------------------------------------------------------------------
-- 5. Aislamiento por inquilino (RLS)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['listing_health', 'listing_suggestions', 'listing_revisions']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I
                 USING      (tenant_id = app_current_tenant())
                 WITH CHECK (tenant_id = app_current_tenant())', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos del rol de aplicación
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON listing_health, listing_suggestions, listing_revisions
            TO controlcenter_app;
        GRANT USAGE, SELECT
            ON SEQUENCE listing_suggestions_id_seq, listing_revisions_id_seq
            TO controlcenter_app;
    END IF;
END
$$;

COMMIT;
