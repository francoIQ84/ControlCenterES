-- Migration 019: Add title_web to products_cache for custom Storefront and Tiendanube product titles
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS title_web TEXT DEFAULT '';
