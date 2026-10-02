-- =====================================================================
-- 018_user_notification_reads.sql — Tracking de notificaciones por usuario
-- Permite que cada usuario del tenant gestione su estado de lectura y descarte
-- de manera independiente, manteniendo las notificaciones intactas para el resto.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_notification_reads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id VARCHAR(255) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT TRUE,
    is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tenant_id UUID DEFAULT app_current_tenant(),
    CONSTRAINT uq_user_notif_read UNIQUE (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_unr_user_id ON user_notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_unr_notif_id ON user_notification_reads(notification_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_reads_tenant_id ON user_notification_reads(tenant_id);

ALTER TABLE user_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_reads FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_notification_reads' AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON user_notification_reads
            USING (tenant_id = app_current_tenant())
            WITH CHECK (tenant_id = app_current_tenant());
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controlcenter_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_notification_reads TO controlcenter_app;
        GRANT USAGE, SELECT ON SEQUENCE user_notification_reads_id_seq TO controlcenter_app;
    END IF;
END $$;

COMMIT;
