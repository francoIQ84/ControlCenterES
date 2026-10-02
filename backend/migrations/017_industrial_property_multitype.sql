-- =====================================================================
-- 017_industrial_property_multitype.sql — Extensión de Propiedad Industrial
-- Soporte para Patentes, Modelos de Utilidad y Diseños Industriales
-- =====================================================================

BEGIN;

-- 1. Agregar columnas a monitored_trademarks para soporte multiactivo
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50) DEFAULT 'marca';
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS subtipo VARCHAR(100);
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS inventores_disenadores TEXT;
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS clasificacion VARCHAR(100);
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS fecha_concesion VARCHAR(50);
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS quinquenio_actual INTEGER DEFAULT 1;
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS anualidades_pagadas INTEGER DEFAULT 0;
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS proxima_anualidad INTEGER;
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS fecha_proximo_vencimiento VARCHAR(50);
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS alerta_estado VARCHAR(50);
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS alerta_mensaje TEXT;
ALTER TABLE monitored_trademarks ADD COLUMN IF NOT EXISTS document_url TEXT;

-- 2. Índices para consultas por tipo de activo y alertas
CREATE INDEX IF NOT EXISTS idx_monitored_trademarks_asset_type ON monitored_trademarks(asset_type);
CREATE INDEX IF NOT EXISTS idx_monitored_trademarks_alerta ON monitored_trademarks(alerta_estado);

-- 3. Permisos para rol de la aplicación
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON monitored_trademarks TO controlcenter_app;
    END IF;
END $$;

COMMIT;
