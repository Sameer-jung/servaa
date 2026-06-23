-- ============================================
-- Migration 007: Bill Combining, Splitting & Partial Payments
-- ============================================
-- Adds a billing layer ABOVE orders/invoices without touching either:
--   * orders.total_amount stays trigger-maintained (calculate_order_total) — untouched.
--   * invoices stays 1:1 with order_id (UNIQUE constraint from fix_duplicate_invoices.sql)
--     and keeps powering customer-facing send/ack delivery — untouched.
--
-- Design:
--   * bills: the staff-created unit that combines one or more COMPLETED orders on a
--     table into a single payable amount. Even a single order becomes a one-row bill —
--     this is the one workflow for both "split this order's bill" and "combine multiple
--     rounds into one bill".
--   * bill_orders: join table; an order can belong to at most one bill (UNIQUE(order_id)).
--   * A bill's total is NEVER cached — it is always computed live by summing the
--     trigger-maintained total_amount of its linked orders (calculate_bill_total below).
--     This keeps the orders trigger authoritative even if an item is cancelled after
--     the order was added to a bill.
--   * bill_splits / bill_split_parts / bill_split_items: an optional staff-defined
--     breakdown of a bill into named parts, either 'equal' (N-way) or 'item' (specific
--     order_item quantities assigned to specific parts). Split amounts are snapshotted
--     at creation time so receipts stay stable.
--   * payments: append-only ledger of amounts tendered against a bill (or a specific
--     split part). bills.status is derived from this ledger via trigger — mirrors the
--     update_order_total pattern in schema.sql.
--
-- Idempotent: safe to re-run.

-- ============================================
-- 1. BILLS
-- ============================================
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bills_restaurant ON bills(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bills_table ON bills(table_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(restaurant_id, status);

-- ============================================
-- 2. BILL_ORDERS (which completed orders a bill combines)
-- ============================================
CREATE TABLE IF NOT EXISTS bill_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_bill_orders_bill ON bill_orders(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_orders_restaurant ON bill_orders(restaurant_id);

-- ============================================
-- 3. BILL_SPLITS (one active split config per bill)
-- ============================================
CREATE TABLE IF NOT EXISTS bill_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'item')),
  total_amount_snapshot DECIMAL(10,2) NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bill_id)
);

CREATE INDEX IF NOT EXISTS idx_bill_splits_restaurant ON bill_splits(restaurant_id);

-- ============================================
-- 4. BILL_SPLIT_PARTS (one row per person/group in a split)
-- ============================================
CREATE TABLE IF NOT EXISTS bill_split_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_split_id UUID NOT NULL REFERENCES bill_splits(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_split_parts_split ON bill_split_parts(bill_split_id);
CREATE INDEX IF NOT EXISTS idx_bill_split_parts_restaurant ON bill_split_parts(restaurant_id);

-- ============================================
-- 5. BILL_SPLIT_ITEMS (split_type='item' only — quantity of an order_item assigned to a part)
-- ============================================
CREATE TABLE IF NOT EXISTS bill_split_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_split_part_id UUID NOT NULL REFERENCES bill_split_parts(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_split_items_part ON bill_split_items(bill_split_part_id);
CREATE INDEX IF NOT EXISTS idx_bill_split_items_order_item ON bill_split_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_bill_split_items_restaurant ON bill_split_items(restaurant_id);

-- ============================================
-- 6. PAYMENTS (append-only ledger)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  bill_split_part_id UUID REFERENCES bill_split_parts(id) ON DELETE SET NULL,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_split_part ON payments(bill_split_part_id);
CREATE INDEX IF NOT EXISTS idx_payments_restaurant ON payments(restaurant_id, created_at DESC);

-- ============================================
-- 7. DERIVED TOTALS + STATUS TRIGGER
-- ============================================

-- Live bill total = tax-inclusive sum of trigger-maintained total_amount across
-- its linked orders (mirrors how invoices.grand_total = subtotal + tax, since
-- that's the amount actually owed). Never cached on the bills row, so a later
-- item cancellation on a combined order is reflected immediately without this
-- layer overriding the orders trigger.
CREATE OR REPLACE FUNCTION calculate_bill_total(p_bill_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_subtotal DECIMAL;
  v_tax_rate DECIMAL;
BEGIN
  SELECT COALESCE(SUM(o.total_amount), 0) INTO v_subtotal
  FROM bill_orders bo
  JOIN orders o ON o.id = bo.order_id
  WHERE bo.bill_id = p_bill_id;

  SELECT COALESCE(r.tax_rate, 0) INTO v_tax_rate
  FROM bills b
  JOIN restaurants r ON r.id = b.restaurant_id
  WHERE b.id = p_bill_id;

  RETURN ROUND(v_subtotal * (1 + v_tax_rate / 100), 2);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_bill_paid(p_bill_id UUID)
RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(amount) FROM payments WHERE bill_id = p_bill_id),
    0
  );
END;
$$ LANGUAGE plpgsql;

-- Recomputes bills.status whenever a payment is recorded/removed. Rounds to
-- cents before comparing so a bill is "paid" once payments meet-or-exceed the
-- total without float drift blocking it.
CREATE OR REPLACE FUNCTION update_bill_status()
RETURNS TRIGGER AS $$
DECLARE
  v_bill_id UUID;
  v_total DECIMAL;
  v_paid DECIMAL;
  v_is_paid BOOLEAN;
BEGIN
  v_bill_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.bill_id ELSE NEW.bill_id END;
  v_total := ROUND(calculate_bill_total(v_bill_id), 2);
  v_paid := ROUND(calculate_bill_paid(v_bill_id), 2);
  v_is_paid := v_total > 0 AND v_paid >= v_total;

  UPDATE bills
  SET status = CASE WHEN v_is_paid THEN 'paid' ELSE 'open' END,
      paid_at = CASE WHEN v_is_paid THEN COALESCE(paid_at, NOW()) ELSE NULL END,
      updated_at = NOW()
  WHERE id = v_bill_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bill_status_on_payment ON payments;
CREATE TRIGGER update_bill_status_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_bill_status();

-- Re-evaluate status if an order is added/removed from a bill after payments exist.
DROP TRIGGER IF EXISTS update_bill_status_on_bill_order ON bill_orders;
CREATE TRIGGER update_bill_status_on_bill_order
  AFTER INSERT OR DELETE ON bill_orders
  FOR EACH ROW EXECUTE FUNCTION update_bill_status();

DROP TRIGGER IF EXISTS update_bills_updated_at ON bills;
CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_split_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_split_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Bills: staff-managed (combining orders, splitting and recording payments is
-- staff-level, matching the existing invoice payment_status PATCH gate).
DROP POLICY IF EXISTS "bills_select_staff" ON bills;
CREATE POLICY "bills_select_staff"
  ON bills FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bills_insert_staff" ON bills;
CREATE POLICY "bills_insert_staff"
  ON bills FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bills_update_staff" ON bills;
CREATE POLICY "bills_update_staff"
  ON bills FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

-- Deleting a bill can discard payment history, so restrict to owners
-- (same rare-correction gating as stock_movements_delete_owner).
DROP POLICY IF EXISTS "bills_delete_owner" ON bills;
CREATE POLICY "bills_delete_owner"
  ON bills FOR DELETE
  USING (is_restaurant_owner(restaurant_id));

DROP POLICY IF EXISTS "bill_orders_select_staff" ON bill_orders;
CREATE POLICY "bill_orders_select_staff"
  ON bill_orders FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_orders_insert_staff" ON bill_orders;
CREATE POLICY "bill_orders_insert_staff"
  ON bill_orders FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_orders_delete_staff" ON bill_orders;
CREATE POLICY "bill_orders_delete_staff"
  ON bill_orders FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_splits_select_staff" ON bill_splits;
CREATE POLICY "bill_splits_select_staff"
  ON bill_splits FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_splits_insert_staff" ON bill_splits;
CREATE POLICY "bill_splits_insert_staff"
  ON bill_splits FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_splits_delete_staff" ON bill_splits;
CREATE POLICY "bill_splits_delete_staff"
  ON bill_splits FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_split_parts_select_staff" ON bill_split_parts;
CREATE POLICY "bill_split_parts_select_staff"
  ON bill_split_parts FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_split_parts_insert_staff" ON bill_split_parts;
CREATE POLICY "bill_split_parts_insert_staff"
  ON bill_split_parts FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_split_parts_delete_staff" ON bill_split_parts;
CREATE POLICY "bill_split_parts_delete_staff"
  ON bill_split_parts FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_split_items_select_staff" ON bill_split_items;
CREATE POLICY "bill_split_items_select_staff"
  ON bill_split_items FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_split_items_insert_staff" ON bill_split_items;
CREATE POLICY "bill_split_items_insert_staff"
  ON bill_split_items FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "bill_split_items_delete_staff" ON bill_split_items;
CREATE POLICY "bill_split_items_delete_staff"
  ON bill_split_items FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

-- Payments: staff can record/read; deletes (rare corrections) restricted to
-- owner, mirroring stock_movements_delete_owner. No UPDATE policy — append-only.
DROP POLICY IF EXISTS "payments_select_staff" ON payments;
CREATE POLICY "payments_select_staff"
  ON payments FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "payments_insert_staff" ON payments;
CREATE POLICY "payments_insert_staff"
  ON payments FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "payments_delete_owner" ON payments;
CREATE POLICY "payments_delete_owner"
  ON payments FOR DELETE
  USING (is_restaurant_owner(restaurant_id));

-- These tables stay OUT of the realtime publication, same as inventory/expenses —
-- the billing UI refetches on mutation rather than subscribing.
