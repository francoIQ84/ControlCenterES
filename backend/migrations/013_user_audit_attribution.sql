-- Migration 013: Add user audit attribution columns to products, orders, and expenses/incomes
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS created_by_user TEXT;
ALTER TABLE products_cache ADD COLUMN IF NOT EXISTS updated_by_user TEXT;
ALTER TABLE orders_cache ADD COLUMN IF NOT EXISTS created_by_user TEXT;
ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS created_by_user TEXT;
ALTER TABLE variable_expenses ADD COLUMN IF NOT EXISTS created_by_user TEXT;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS created_by_user TEXT;
