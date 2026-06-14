-- Migration: order item cancellation
-- Adds soft-cancel support to order_items and updates the total trigger
-- to exclude cancelled items from order totals.

-- 1. Add cancelled flag (DEFAULT false fills all existing rows immediately)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT false;

-- 2. Update the total function to exclude cancelled items
CREATE OR REPLACE FUNCTION calculate_order_total(p_order_id UUID)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(quantity * price_snapshot)
     FROM order_items
     WHERE order_id = p_order_id
       AND cancelled = false),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- 3. Index for fast "active items in order" queries
CREATE INDEX IF NOT EXISTS idx_order_items_order_cancelled
  ON order_items(order_id, cancelled);
