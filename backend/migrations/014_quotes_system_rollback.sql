-- =====================================================================
-- 014_quotes_system_rollback.sql — Reversión de Presupuestos
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS quotes CASCADE;
ALTER TABLE products_cache DROP COLUMN IF EXISTS price_tn;

COMMIT;
