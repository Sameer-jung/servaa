-- ============================================
-- Fix Duplicate Invoices
-- - Removes duplicate invoices for the same order, keeping the oldest one
-- - Adds a UNIQUE constraint to order_id to prevent future duplicates
-- ============================================

-- 1. Remove duplicate invoices
DELETE FROM invoices
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at ASC) as row_num
        FROM invoices
    ) t
    WHERE t.row_num > 1
);

-- 2. Add unique constraint on order_id
ALTER TABLE invoices ADD CONSTRAINT invoices_order_id_key UNIQUE (order_id);
