-- =====================================================================
-- 006_google_drive_integration.sql — Soporte para Google Drive (Backups)
-- =====================================================================

BEGIN;

-- 1. Ampliar proveedores permitidos en tenant_integrations
ALTER TABLE tenant_integrations DROP CONSTRAINT IF EXISTS tenant_integrations_provider_check;
ALTER TABLE tenant_integrations ADD CONSTRAINT tenant_integrations_provider_check
    CHECK (provider IN ('mercadolibre', 'mercadopago', 'afip', 'meta', 'google', 'whatsapp', 'tiendanube', 'google_drive'));

COMMIT;
