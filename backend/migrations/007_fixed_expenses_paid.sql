-- Migration: Add is_paid to fixed_expenses

ALTER TABLE fixed_expenses
ADD COLUMN is_paid BOOLEAN DEFAULT FALSE;
