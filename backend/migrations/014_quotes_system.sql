-- =====================================================================
-- 014_quotes_system.sql — Módulo de Presupuestos y Lista de Precios TN
-- =====================================================================

BEGIN;

-- 1. Columna price_tn en products_cache para precios específicos de Tiendanube
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS price_tn REAL DEFAULT 0.0;

-- 2. Tabla de presupuestos (quotes)
CREATE TABLE IF NOT EXISTS quotes (
    id SERIAL PRIMARY KEY,
    quote_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_doc VARCHAR(50),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(100),
    customer_address TEXT,
    price_source VARCHAR(50) DEFAULT 'web',
    items_json TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0.0,
    valid_days INTEGER NOT NULL DEFAULT 7,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_by_user VARCHAR(255),
    order_id BIGINT,
    tenant_id UUID NOT NULL DEFAULT app_current_tenant() REFERENCES tenants(id) ON DELETE CASCADE
);

-- 3. Índices para performance y consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_id ON quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_order_id ON quotes(order_id);

-- 4. Habilitar Row Level Security (RLS) para aislamiento multi-tenant
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON quotes;
CREATE POLICY tenant_isolation ON quotes
    USING (tenant_id = app_current_tenant())
    WITH CHECK (tenant_id = app_current_tenant());

-- 5. Privilegios para el rol de la aplicación
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON quotes TO controlcenter_app;
        GRANT USAGE, SELECT ON SEQUENCE quotes_id_seq TO controlcenter_app;
    END IF;
END $$;

COMMIT;
