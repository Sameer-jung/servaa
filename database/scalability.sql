-- ============================================
-- Scalability improvements
-- - Query indexes for orders/invoices/order_items
-- - Dashboard aggregate RPC
-- ============================================

-- Orders are commonly filtered by restaurant, table, status, and recency.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created
  ON orders(restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created
  ON orders(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_table_created
  ON orders(restaurant_id, table_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_table_created
  ON orders(table_id, created_at DESC);

-- Invoices are commonly filtered by restaurant, payment status, order, and recency.
CREATE INDEX IF NOT EXISTS idx_invoices_restaurant_created
  ON invoices(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_restaurant_payment_created
  ON invoices(restaurant_id, payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_restaurant_order
  ON invoices(restaurant_id, order_id);

-- Order item joins are always by order_id, and item lookups use menu_item_id.
CREATE INDEX IF NOT EXISTS idx_order_items_order_menu_item
  ON order_items(order_id, menu_item_id);

-- Dashboard aggregate RPC. Keeps dashboard totals in the database instead of
-- making multiple client-side count/sum queries.
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_restaurant_id UUID)
RETURNS TABLE (
  active_orders BIGINT,
  active_tables BIGINT,
  today_sales NUMERIC,
  pending_orders BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (
      SELECT COUNT(*)
      FROM orders
      WHERE restaurant_id = p_restaurant_id
      AND status IN ('pending', 'accepted', 'preparing', 'ready')
    ) AS active_orders,
    (
      SELECT COUNT(*)
      FROM tables
      WHERE restaurant_id = p_restaurant_id
      AND is_active = true
    ) AS active_tables,
    (
      SELECT COALESCE(SUM(total_amount), 0)
      FROM orders
      WHERE restaurant_id = p_restaurant_id
      AND status = 'completed'
      AND created_at >= DATE_TRUNC('day', NOW())
    ) AS today_sales,
    (
      SELECT COUNT(*)
      FROM orders
      WHERE restaurant_id = p_restaurant_id
      AND status = 'pending'
    ) AS pending_orders;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
