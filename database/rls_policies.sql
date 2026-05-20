-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if user is staff/owner of a restaurant
CREATE OR REPLACE FUNCTION is_restaurant_staff(p_restaurant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff_members
    WHERE restaurant_id = p_restaurant_id
    AND user_id = auth.uid()
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user owns a restaurant
CREATE OR REPLACE FUNCTION is_restaurant_owner(p_restaurant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM restaurants
    WHERE id = p_restaurant_id
    AND owner_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's restaurant IDs
CREATE OR REPLACE FUNCTION get_user_restaurant_ids()
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT restaurant_id FROM staff_members
    WHERE user_id = auth.uid()
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RESTAURANTS POLICIES
-- ============================================

-- Owners can create restaurants
CREATE POLICY "restaurants_insert_owner"
  ON restaurants FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Owners and staff can view their restaurants
CREATE POLICY "restaurants_select_staff"
  ON restaurants FOR SELECT
  USING (
    auth.uid() = owner_id
    OR is_restaurant_staff(id)
  );

-- Customers can view active restaurants when opening QR menu links
CREATE POLICY "restaurants_select_public_active"
  ON restaurants FOR SELECT
  USING (is_active = true);

-- Only owner can update their restaurant
CREATE POLICY "restaurants_update_owner"
  ON restaurants FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Only owner can delete their restaurant
CREATE POLICY "restaurants_delete_owner"
  ON restaurants FOR DELETE
  USING (auth.uid() = owner_id);

-- ============================================
-- TABLES POLICIES
-- ============================================

-- Staff can manage tables
CREATE POLICY "tables_insert_staff"
  ON tables FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "tables_select_staff"
  ON tables FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "tables_select_public"
  ON tables FOR SELECT
  USING (true); -- Public for QR scanning

CREATE POLICY "tables_update_staff"
  ON tables FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "tables_delete_staff"
  ON tables FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

-- ============================================
-- MENU CATEGORIES POLICIES
-- ============================================

CREATE POLICY "menu_categories_insert_staff"
  ON menu_categories FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "menu_categories_select_public"
  ON menu_categories FOR SELECT
  USING (true); -- Public for menu viewing

CREATE POLICY "menu_categories_update_staff"
  ON menu_categories FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "menu_categories_delete_staff"
  ON menu_categories FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

-- ============================================
-- MENU ITEMS POLICIES
-- ============================================

CREATE POLICY "menu_items_insert_staff"
  ON menu_items FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "menu_items_select_public"
  ON menu_items FOR SELECT
  USING (true); -- Public for menu viewing

CREATE POLICY "menu_items_update_staff"
  ON menu_items FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "menu_items_delete_staff"
  ON menu_items FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

-- ============================================
-- ORDERS POLICIES
-- ============================================

-- Customers can create orders (no auth required)
CREATE POLICY "orders_insert_public"
  ON orders FOR INSERT
  WITH CHECK (true);

-- Staff can view their restaurant orders
CREATE POLICY "orders_select_staff"
  ON orders FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

-- Public can view orders by table (for customer tracking)
CREATE POLICY "orders_select_by_table"
  ON orders FOR SELECT
  USING (true); -- Filtered by table_id in application

-- Staff can update orders
CREATE POLICY "orders_update_staff"
  ON orders FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

-- ============================================
-- ORDER ITEMS POLICIES
-- ============================================

CREATE POLICY "order_items_insert_public"
  ON order_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "order_items_select_staff"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND is_restaurant_staff(o.restaurant_id)
    )
  );

CREATE POLICY "order_items_select_public"
  ON order_items FOR SELECT
  USING (true); -- For customer order tracking

CREATE POLICY "order_items_update_staff"
  ON order_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND is_restaurant_staff(o.restaurant_id)
    )
  );

CREATE POLICY "order_items_delete_staff"
  ON order_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND is_restaurant_staff(o.restaurant_id)
    )
  );

-- ============================================
-- INVOICES POLICIES
-- ============================================

CREATE POLICY "invoices_insert_staff"
  ON invoices FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "invoices_select_staff"
  ON invoices FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "invoices_update_staff"
  ON invoices FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "invoices_delete_staff"
  ON invoices FOR DELETE
  USING (is_restaurant_staff(restaurant_id));

-- ============================================
-- SERVICE REQUESTS POLICIES
-- ============================================

CREATE POLICY "service_requests_insert_public"
  ON service_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "service_requests_select_staff"
  ON service_requests FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "service_requests_update_staff"
  ON service_requests FOR UPDATE
  USING (is_restaurant_staff(restaurant_id))
  WITH CHECK (is_restaurant_staff(restaurant_id));

-- ============================================
-- STAFF MEMBERS POLICIES
-- ============================================

-- Owners can manage staff
CREATE POLICY "staff_members_insert_owner"
  ON staff_members FOR INSERT
  WITH CHECK (is_restaurant_owner(restaurant_id));

CREATE POLICY "staff_members_select_staff"
  ON staff_members FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

CREATE POLICY "staff_members_update_owner"
  ON staff_members FOR UPDATE
  USING (is_restaurant_owner(restaurant_id))
  WITH CHECK (is_restaurant_owner(restaurant_id));

CREATE POLICY "staff_members_delete_owner"
  ON staff_members FOR DELETE
  USING (is_restaurant_owner(restaurant_id));

-- ============================================
-- AUDIT LOGS POLICIES
-- ============================================

CREATE POLICY "audit_logs_insert_staff"
  ON audit_logs FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

CREATE POLICY "audit_logs_select_staff"
  ON audit_logs FOR SELECT
  USING (is_restaurant_staff(restaurant_id));
