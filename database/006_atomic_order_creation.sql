-- ============================================
-- Migration 006: Atomic order creation
-- Wraps the order + order_items inserts in a single function call so they
-- commit or roll back together, instead of the app inserting the order,
-- inserting items, and manually deleting the order on item-insert failure.
-- ============================================

CREATE OR REPLACE FUNCTION create_order_with_items(
  p_restaurant_id UUID,
  p_table_id UUID,
  p_total_amount DECIMAL,
  p_client_request_id TEXT,
  p_customer_session_id TEXT,
  p_items JSONB
)
RETURNS UUID AS $$
DECLARE
  v_order_id UUID;
BEGIN
  INSERT INTO orders (restaurant_id, table_id, status, total_amount, client_request_id, customer_session_id)
  VALUES (p_restaurant_id, p_table_id, 'pending', p_total_amount, p_client_request_id, p_customer_session_id)
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, quantity, price_snapshot, notes, modifiers)
  SELECT
    v_order_id,
    (item->>'menu_item_id')::UUID,
    item->>'item_name_snapshot',
    (item->>'quantity')::INTEGER,
    (item->>'price_snapshot')::DECIMAL,
    item->>'notes',
    COALESCE(item->'modifiers', '[]'::jsonb)
  FROM jsonb_array_elements(p_items) AS item;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
