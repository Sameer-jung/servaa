-- ============================================
-- Migration 004: Inventory & Expense Tracking
-- ============================================
-- Adds a manual stock ledger (inventory_items + stock_movements) and an
-- owner-only expense log (expenses).
--
-- Design notes:
--   * stock_movements is an APPEND-ONLY ledger and the source of truth.
--     inventory_items.current_quantity is a cached projection maintained by
--     a trigger (mirrors the orders.total_amount pattern in schema.sql).
--   * Corrections are new 'adjustment' movements; stocktakes are 'count'
--     movements whose quantity_delta is the correcting delta computed by the
--     API (counted_value - current_quantity). The ledger stays purely additive.
--   * A 'purchase' movement may optionally be linked to an expense row so that
--     buying stock and spending money are recorded once (see /api/inventory).
--   * Inventory is staff-accessible; expenses are owner-only (financials).
--   * These tables intentionally stay OUT of the realtime publication.
--
-- Idempotent: safe to re-run.

-- ============================================
-- 1. INVENTORY ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece'
    CHECK (unit IN ('kg', 'g', 'l', 'ml', 'piece', 'bottle', 'packet', 'other')),
  category TEXT,
  current_quantity NUMERIC(12,3) NOT NULL DEFAULT 0, -- maintained by trigger; never written by app
  reorder_threshold NUMERIC(12,3) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_restaurant ON inventory_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_low_stock ON inventory_items(restaurant_id, current_quantity);

-- ============================================
-- 2. EXPENSES (owner-only)
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('ingredients', 'supplies', 'rent', 'salaries', 'utilities', 'equipment', 'marketing', 'other')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  vendor TEXT,
  payment_method TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'inventory_purchase')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_restaurant_date ON expenses(restaurant_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_restaurant_category ON expenses(restaurant_id, category);

-- ============================================
-- 3. STOCK MOVEMENTS (append-only ledger)
-- ============================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('purchase', 'usage', 'wastage', 'adjustment', 'count')),
  quantity_delta NUMERIC(12,3) NOT NULL, -- signed: purchase +, usage/wastage -, adjustment/count +/-
  unit_cost NUMERIC(12,2),               -- for purchases
  note TEXT,
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_restaurant ON stock_movements(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id, created_at DESC);

-- ============================================
-- 4. STOCK QUANTITY PROJECTION
-- ============================================
-- Recompute current_quantity for a single item from the full ledger.
CREATE OR REPLACE FUNCTION recalculate_inventory_quantity(p_item_id UUID)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(quantity_delta) FROM stock_movements WHERE inventory_item_id = p_item_id),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Trigger keeping inventory_items.current_quantity in sync with the ledger
-- (mirrors update_order_total in schema.sql).
CREATE OR REPLACE FUNCTION update_inventory_quantity()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id UUID;
BEGIN
  v_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.inventory_item_id ELSE NEW.inventory_item_id END;

  UPDATE inventory_items
  SET current_quantity = recalculate_inventory_quantity(v_item_id),
      updated_at = NOW()
  WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_quantity_on_movement ON stock_movements;
CREATE TRIGGER update_inventory_quantity_on_movement
  AFTER INSERT OR UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION update_inventory_quantity();

-- Safety valve: rebuild every item's projection for a restaurant from the ledger.
CREATE OR REPLACE FUNCTION recompute_all_inventory_quantities(p_restaurant_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE inventory_items i
  SET current_quantity = recalculate_inventory_quantity(i.id),
      updated_at = NOW()
  WHERE i.restaurant_id = p_restaurant_id;
END;
$$ LANGUAGE plpgsql;

-- updated_at maintenance (reuses update_updated_at_column from schema.sql)
DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Inventory items: staff-managed
DROP POLICY IF EXISTS "inventory_items_select_staff" ON inventory_items;
CREATE POLICY "inventory_items_select_staff"
  ON inventory_items FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "inventory_items_insert_staff" ON inventory_items;
CREATE POLICY "inventory_items_insert_staff"
  ON inventory_items FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "inventory_items_update_staff" ON inventory_items;
CREATE POLICY "inventory_items_update_staff"
  ON inventory_items FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "inventory_items_delete_staff" ON inventory_items;
CREATE POLICY "inventory_items_delete_staff"
  ON inventory_items FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

-- Stock movements: staff can read and append; ledger is append-only
-- (no UPDATE policy). Deletes restricted to owner for rare corrections.
DROP POLICY IF EXISTS "stock_movements_select_staff" ON stock_movements;
CREATE POLICY "stock_movements_select_staff"
  ON stock_movements FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "stock_movements_insert_staff" ON stock_movements;
CREATE POLICY "stock_movements_insert_staff"
  ON stock_movements FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "stock_movements_delete_owner" ON stock_movements;
CREATE POLICY "stock_movements_delete_owner"
  ON stock_movements FOR DELETE
  USING (is_restaurant_owner(restaurant_id));

-- Expenses: owner-only (sensitive financials)
DROP POLICY IF EXISTS "expenses_select_owner" ON expenses;
CREATE POLICY "expenses_select_owner"
  ON expenses FOR SELECT
  USING (is_restaurant_owner(restaurant_id));

DROP POLICY IF EXISTS "expenses_insert_owner" ON expenses;
CREATE POLICY "expenses_insert_owner"
  ON expenses FOR INSERT
  WITH CHECK (is_restaurant_owner(restaurant_id));

DROP POLICY IF EXISTS "expenses_update_owner" ON expenses;
CREATE POLICY "expenses_update_owner"
  ON expenses FOR UPDATE
  USING (is_restaurant_owner(restaurant_id))
  WITH CHECK (is_restaurant_owner(restaurant_id));

DROP POLICY IF EXISTS "expenses_delete_owner" ON expenses;
CREATE POLICY "expenses_delete_owner"
  ON expenses FOR DELETE
  USING (is_restaurant_owner(restaurant_id));
