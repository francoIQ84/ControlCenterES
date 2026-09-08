-- Migration 010: Exclude internal self-funding and partner transfers from commercial sales
INSERT INTO settings (tenant_id, key, value)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'mp_excluded_emails', 'greenorbitalinfo@gmail.com, francoag84@gmail.com')
ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value;

-- Clean up existing internal self-funding orders from orders_cache
DELETE FROM orders_cache
WHERE source_platform = 'MERCADOPAGO_TRANSFER'
  AND (
      buyer_id = 621429303
      OR LOWER(buyer_nickname) IN ('greenorbitalinfo@gmail.com', 'francoag84@gmail.com')
      OR LOWER(buyer_name) IN ('greenorbitalinfo@gmail.com', 'francoag84@gmail.com')
  );
