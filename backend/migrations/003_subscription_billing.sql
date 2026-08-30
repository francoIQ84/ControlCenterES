-- =====================================================================
-- 003_subscription_billing.sql — Facturación y Recordatorios de Suscripción
-- =====================================================================

BEGIN;

-- 1. Agregar columnas a la tabla tenants para gestión de vencimientos y precios
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_email VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_phone VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_price REAL DEFAULT 0.0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_billing_date DATE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP;

-- 2. Asignar fecha de vencimiento por defecto a los que no tengan (30 días en el futuro)
UPDATE tenants
SET next_billing_date = CURRENT_DATE + INTERVAL '30 days'
WHERE next_billing_date IS NULL;

-- 3. Tabla histórica de cobros de suscripción
CREATE TABLE IF NOT EXISTS tenant_subscription_payments (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mp_payment_id VARCHAR(100),
    amount REAL NOT NULL,
    currency VARCHAR(10) DEFAULT 'ARS',
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    period_start DATE,
    period_end DATE,
    status VARCHAR(50) DEFAULT 'approved',
    payment_method VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_sub_payments_tenant ON tenant_subscription_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sub_payments_mp_id ON tenant_subscription_payments(mp_payment_id);

COMMIT;
