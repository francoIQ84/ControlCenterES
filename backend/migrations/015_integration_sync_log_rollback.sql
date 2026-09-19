-- =====================================================================
-- 015_integration_sync_log_rollback.sql
--
-- Deja la base exactamente como estaba antes de 015. No se pierde nada
-- operativo: el registro de sincronización es metadato, las ventas y los
-- cobros viven en sus propias tablas.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS integration_sync_log;
DROP TABLE IF EXISTS integration_sync_state;

COMMIT;
