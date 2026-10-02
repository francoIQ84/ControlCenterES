-- =====================================================================
-- 017_industrial_property_multitype_rollback.sql
-- =====================================================================

BEGIN;

DROP INDEX IF EXISTS idx_monitored_trademarks_asset_type;
DROP INDEX IF EXISTS idx_monitored_trademarks_alerta;

ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS asset_type;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS subtipo;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS inventores_disenadores;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS clasificacion;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS fecha_concesion;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS quinquenio_actual;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS anualidades_pagadas;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS proxima_anualidad;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS fecha_proximo_vencimiento;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS alerta_estado;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS alerta_mensaje;
ALTER TABLE monitored_trademarks DROP COLUMN IF EXISTS document_url;

COMMIT;
