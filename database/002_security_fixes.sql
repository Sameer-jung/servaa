-- ============================================
-- Security Fixes Migration (002)
-- ============================================
-- Addresses: C1, C2, H6

-- ============================================
-- C2: Scope public ORDER inserts to pending status only
-- Prevents customers from inserting orders with arbitrary status values
-- (e.g., status='completed' to forge a completed order)
-- ============================================
DROP POLICY IF EXISTS "orders_insert_public" ON orders;
CREATE POLICY "orders_insert_public"
  ON orders FOR INSERT
  WITH CHECK (status = 'pending');

-- Prevent inserting order_items into non-pending orders
DROP POLICY IF EXISTS "order_items_insert_public" ON order_items;
CREATE POLICY "order_items_insert_public"
  ON order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE id = order_items.order_id
      AND status = 'pending'
    )
  );

-- ============================================
-- C1: Remove global public read access to orders and order_items
-- Customer order reads are now routed through authenticated server API
-- endpoints (/api/orders/session, /api/orders/bill, /api/orders/[id]/status)
-- that use supabaseAdmin with explicit session/token validation.
-- ============================================
DROP POLICY IF EXISTS "orders_select_by_table" ON orders;
DROP POLICY IF EXISTS "order_items_select_public" ON order_items;

-- ============================================
-- H6: Consolidate modifier RLS into clean policies
-- Replaces fragmented owner+staff dual-policy pattern (which does two
-- subquery lookups per row) with the is_restaurant_staff() helper
-- already used by every other table in rls_policies.sql.
-- ============================================

-- Drop all existing overlapping modifier_groups policies
DROP POLICY IF EXISTS "Owners can view own modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Owners can insert own modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Owners can update own modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Owners can delete own modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Staff can view modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Staff can insert modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Staff can update modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Staff can delete modifier_groups" ON modifier_groups;
DROP POLICY IF EXISTS "Public can view active restaurant modifier_groups" ON modifier_groups;

-- Drop all existing overlapping modifiers policies
DROP POLICY IF EXISTS "Owners can view own modifiers" ON modifiers;
DROP POLICY IF EXISTS "Owners can insert own modifiers" ON modifiers;
DROP POLICY IF EXISTS "Owners can update own modifiers" ON modifiers;
DROP POLICY IF EXISTS "Owners can delete own modifiers" ON modifiers;
DROP POLICY IF EXISTS "Staff can view modifiers" ON modifiers;
DROP POLICY IF EXISTS "Staff can insert modifiers" ON modifiers;
DROP POLICY IF EXISTS "Staff can update modifiers" ON modifiers;
DROP POLICY IF EXISTS "Staff can delete modifiers" ON modifiers;
DROP POLICY IF EXISTS "Public can view active restaurant modifiers" ON modifiers;

-- Consolidated modifier_groups policies using is_restaurant_staff() helper
CREATE POLICY "modifier_groups_select_public"
  ON modifier_groups FOR SELECT
  USING (true);

CREATE POLICY "modifier_groups_insert_staff"
  ON modifier_groups FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "modifier_groups_update_staff"
  ON modifier_groups FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "modifier_groups_delete_staff"
  ON modifier_groups FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

-- Consolidated modifiers policies using is_restaurant_staff() helper
CREATE POLICY "modifiers_select_public"
  ON modifiers FOR SELECT
  USING (true);

CREATE POLICY "modifiers_insert_staff"
  ON modifiers FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "modifiers_update_staff"
  ON modifiers FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "modifiers_delete_staff"
  ON modifiers FOR DELETE
  USING (is_restaurant_staff(restaurant_id));
