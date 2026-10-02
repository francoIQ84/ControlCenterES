-- =====================================================================
-- 018_user_notification_reads_rollback.sql
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS user_notification_reads CASCADE;

COMMIT;
