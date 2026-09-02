-- =====================================================================
-- 004_pickup_point_messaging.sql — Mensajes para Punto de Retiro ML
-- =====================================================================

BEGIN;

-- 1. Agregar columna de control de mensaje de punto de retiro a orders_cache
ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS shipping_pickup_msg_sent INTEGER DEFAULT 0;

COMMIT;
