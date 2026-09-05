-- Migration 008: Add cash_discount_pct to products_cache for internal cash pricing
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS cash_discount_pct REAL DEFAULT 0.0;
