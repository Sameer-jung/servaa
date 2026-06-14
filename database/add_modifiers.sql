-- ============================================
-- Menu Add-ons / Modifiers Migration
-- ============================================

-- 1. Create modifier_groups table
CREATE TABLE IF NOT EXISTS modifier_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT false,
  is_multiselect BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modifier_groups_restaurant ON modifier_groups(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_menu_item ON modifier_groups(menu_item_id);

-- 2. Create modifiers table
CREATE TABLE IF NOT EXISTS modifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modifiers_restaurant ON modifiers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers(group_id);

-- 3. Update order_items table
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb;

-- 4. Set up RLS Policies for the new tables
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;

-- Owner Policies (Full Access)
CREATE POLICY "Owners can view own modifier_groups"
  ON modifier_groups FOR SELECT
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can insert own modifier_groups"
  ON modifier_groups FOR INSERT
  WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can update own modifier_groups"
  ON modifier_groups FOR UPDATE
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can delete own modifier_groups"
  ON modifier_groups FOR DELETE
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can view own modifiers"
  ON modifiers FOR SELECT
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can insert own modifiers"
  ON modifiers FOR INSERT
  WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can update own modifiers"
  ON modifiers FOR UPDATE
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can delete own modifiers"
  ON modifiers FOR DELETE
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));

-- Staff Policies (Full Access via staff_members)
CREATE POLICY "Staff can view modifier_groups"
  ON modifier_groups FOR SELECT
  USING (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Staff can insert modifier_groups"
  ON modifier_groups FOR INSERT
  WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Staff can update modifier_groups"
  ON modifier_groups FOR UPDATE
  USING (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Staff can delete modifier_groups"
  ON modifier_groups FOR DELETE
  USING (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Staff can view modifiers"
  ON modifiers FOR SELECT
  USING (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Staff can insert modifiers"
  ON modifiers FOR INSERT
  WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Staff can update modifiers"
  ON modifiers FOR UPDATE
  USING (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Staff can delete modifiers"
  ON modifiers FOR DELETE
  USING (restaurant_id IN (SELECT restaurant_id FROM staff_members WHERE user_id = auth.uid() AND is_active = true));

-- Public Policies (Read Only for active restaurants)
CREATE POLICY "Public can view active restaurant modifier_groups"
  ON modifier_groups FOR SELECT
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE is_active = true));

CREATE POLICY "Public can view active restaurant modifiers"
  ON modifiers FOR SELECT
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE is_active = true));
