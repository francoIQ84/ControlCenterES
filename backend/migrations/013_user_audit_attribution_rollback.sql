-- Rollback Migration 013: Drop user audit attribution columns
ALTER TABLE products_cache DROP COLUMN IF EXISTS created_by_user;
ALTER TABLE products_cache DROP COLUMN IF EXISTS updated_by_user;
ALTER TABLE orders_cache DROP COLUMN IF EXISTS created_by_user;
ALTER TABLE fixed_expenses DROP COLUMN IF EXISTS created_by_user;
ALTER TABLE variable_expenses DROP COLUMN IF EXISTS created_by_user;
ALTER TABLE incomes DROP COLUMN IF EXISTS created_by_user;
