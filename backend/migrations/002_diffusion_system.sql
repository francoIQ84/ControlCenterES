-- =====================================================================
-- 002_diffusion_system.sql — Grupos de Difusión & Campañas Masivas
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS diffusion_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    channel_type VARCHAR(50) DEFAULT 'both',
    criteria_json TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id uuid DEFAULT app_current_tenant()
);

CREATE TABLE IF NOT EXISTS diffusion_group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES diffusion_groups(id) ON DELETE CASCADE,
    customer_id BIGINT,
    contact_name VARCHAR(255),
    phone VARCHAR(100),
    email VARCHAR(255),
    source VARCHAR(50) DEFAULT 'MANUAL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id uuid DEFAULT app_current_tenant()
);

CREATE TABLE IF NOT EXISTS diffusion_campaigns (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
    group_id INTEGER REFERENCES diffusion_groups(id) ON DELETE SET NULL,
    post_id INTEGER,
    message_text TEXT,
    media_url TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    total_targets INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    logs_json TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    tenant_id uuid DEFAULT app_current_tenant()
);

CREATE INDEX IF NOT EXISTS idx_diffusion_groups_tenant ON diffusion_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_diffusion_group_members_group ON diffusion_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_diffusion_group_members_tenant ON diffusion_group_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_diffusion_campaigns_tenant ON diffusion_campaigns(tenant_id);

COMMIT;
