-- Rollback 019: Drop title_web from products_cache
ALTER TABLE products_cache DROP COLUMN IF EXISTS title_web;
