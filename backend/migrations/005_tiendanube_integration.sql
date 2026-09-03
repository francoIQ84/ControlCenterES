-- =====================================================================
-- 005_tiendanube_integration.sql — Soporte para Tiendanube (Nuvemshop)
-- =====================================================================

BEGIN;

-- 1. Ampliar proveedores permitidos en tenant_integrations
ALTER TABLE tenant_integrations DROP CONSTRAINT IF EXISTS tenant_integrations_provider_check;
ALTER TABLE tenant_integrations ADD CONSTRAINT tenant_integrations_provider_check
    CHECK (provider IN ('mercadolibre', 'mercadopago', 'afip', 'meta', 'google', 'whatsapp', 'tiendanube'));

-- 2. Columnas de mapeo de Tiendanube en products_cache
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS tn_id VARCHAR(100);
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS tn_variant_id VARCHAR(100);
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS sync_tn INTEGER DEFAULT 1;
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS last_sync_tn TEXT;

CREATE INDEX IF NOT EXISTS idx_products_cache_tn_id ON products_cache (tenant_id, tn_id);
CREATE INDEX IF NOT EXISTS idx_products_cache_tn_variant_id ON products_cache (tenant_id, tn_variant_id);

-- 3. Columna de mapeo de Tiendanube en categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tn_id VARCHAR(100);

COMMIT;
