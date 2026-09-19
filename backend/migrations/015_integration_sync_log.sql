-- =====================================================================
-- 015_integration_sync_log.sql — Registro de sincronización por tenant
--
-- Cada inquilino necesita saber, para cada canal (Mercado Libre, Mercado
-- Pago, Tiendanube), cuándo fue la última actualización y desde qué fecha
-- tiene que arrancar la próxima. Hasta ahora la ventana se calculaba en el
-- aire ("desde la medianoche de hoy", "las últimas 24hs"), así que si el
-- servicio estuvo caído dos días esas ventas nunca se recuperaban.
--
-- Dos tablas con responsabilidades distintas:
--   * integration_sync_state → una fila por (tenant, proveedor, recurso):
--     la marca de agua vigente. Es lo que se lee para decidir desde cuándo
--     sincronizar.
--   * integration_sync_log   → historial de corridas. Es lo que se lee para
--     auditar y diagnosticar.
--
-- Idempotente y reversible (ver 015_integration_sync_log_rollback.sql).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Marca de agua vigente por canal
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_sync_state (
    id                   SERIAL PRIMARY KEY,
    provider             VARCHAR(50) NOT NULL,
    -- Qué se sincroniza dentro del proveedor: un mismo canal tiene ritmos
    -- distintos (el catálogo se baja entero, los pedidos son incrementales).
    resource             VARCHAR(50) NOT NULL,
    -- Marca de agua: la próxima corrida arranca desde acá (menos el solape).
    cursor_at            TIMESTAMP WITH TIME ZONE,
    last_run_at          TIMESTAMP WITH TIME ZONE,
    last_success_at      TIMESTAMP WITH TIME ZONE,
    last_status          VARCHAR(20),
    last_error           TEXT,
    last_items           INTEGER NOT NULL DEFAULT 0,
    last_trigger         VARCHAR(20),
    total_items          BIGINT  NOT NULL DEFAULT 0,
    total_runs           INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tenant_id            UUID NOT NULL DEFAULT app_current_tenant()
                              REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT integration_sync_state_unique UNIQUE (tenant_id, provider, resource)
);

CREATE INDEX IF NOT EXISTS idx_sync_state_tenant
    ON integration_sync_state (tenant_id, provider, resource);

-- ---------------------------------------------------------------------
-- 2. Historial de corridas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_sync_log (
    id             BIGSERIAL PRIMARY KEY,
    provider       VARCHAR(50) NOT NULL,
    resource       VARCHAR(50) NOT NULL,
    -- Quién la disparó: el scheduler, una persona desde el panel o un webhook.
    trigger_source VARCHAR(20) NOT NULL DEFAULT 'scheduler',
    status         VARCHAR(20) NOT NULL DEFAULT 'running',
    -- Ventana efectivamente pedida al proveedor. window_from NULL = sin filtro
    -- de fecha (bajada completa).
    window_from    TIMESTAMP WITH TIME ZONE,
    window_to      TIMESTAMP WITH TIME ZONE,
    items_synced   INTEGER NOT NULL DEFAULT 0,
    error_message  TEXT,
    started_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at    TIMESTAMP WITH TIME ZONE,
    duration_ms    INTEGER,
    tenant_id      UUID NOT NULL DEFAULT app_current_tenant()
                        REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT integration_sync_log_status_check
        CHECK (status IN ('running', 'success', 'error', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_sync_log_tenant_started
    ON integration_sync_log (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_provider
    ON integration_sync_log (tenant_id, provider, resource, started_at DESC);

-- ---------------------------------------------------------------------
-- 3. Semilla: arrancar desde lo que ya sabemos
--
-- `tenant_integrations.last_sync_at` es lo único parecido a una marca de agua
-- que existía. Se usa como punto de partida para no empezar de cero en las
-- cuentas ya vinculadas; donde no hay dato, la aplicación cae a su ventana por
-- defecto (7 días).
--
-- Va ANTES de habilitar RLS a propósito: son filas de todos los inquilinos a
-- la vez, y con la política activa el WITH CHECK rechazaría las que no son del
-- tenant de la sesión. La migración la aplica el dueño del esquema, que es
-- quien puede leer `tenant_integrations` completa.
-- ---------------------------------------------------------------------
INSERT INTO integration_sync_state (tenant_id, provider, resource, cursor_at, last_success_at)
SELECT ti.tenant_id, ti.provider, r.resource, ti.last_sync_at, ti.last_sync_at
FROM tenant_integrations ti
CROSS JOIN LATERAL (
    SELECT unnest(
        CASE ti.provider
            WHEN 'mercadolibre' THEN ARRAY['orders', 'products']
            WHEN 'mercadopago'  THEN ARRAY['payments']
            WHEN 'tiendanube'   THEN ARRAY['orders']
            ELSE ARRAY[]::text[]
        END
    ) AS resource
) r
WHERE ti.last_sync_at IS NOT NULL
ON CONFLICT (tenant_id, provider, resource) DO NOTHING;


-- ---------------------------------------------------------------------
-- 4. Aislamiento multi-tenant (RLS)
-- ---------------------------------------------------------------------
ALTER TABLE integration_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integration_sync_state;
CREATE POLICY tenant_isolation ON integration_sync_state
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE integration_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON integration_sync_log;
CREATE POLICY tenant_isolation ON integration_sync_log
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());

-- ---------------------------------------------------------------------
-- 5. Privilegios del rol de aplicación
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON integration_sync_state TO controlcenter_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON integration_sync_log   TO controlcenter_app;
        GRANT USAGE, SELECT ON SEQUENCE integration_sync_state_id_seq TO controlcenter_app;
        GRANT USAGE, SELECT ON SEQUENCE integration_sync_log_id_seq   TO controlcenter_app;
    END IF;
END $$;

COMMIT;
