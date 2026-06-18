-- ============================================
-- Migration 005: Per-restaurant inventory categories
-- ============================================
-- Inventory item categories were a fixed enum in app code. This adds a
-- per-restaurant extensible list: the app keeps a set of defaults that always
-- appear, and any CUSTOM category a restaurant adds (via the "Other" option on
-- the Add Item form) is persisted here so it shows up for every future item.
--
-- Notes:
--   * Defaults live in app code (src/utils/inventory.ts) — only custom
--     categories are stored here, scoped to restaurant_id.
--   * Exact duplicates are prevented case-insensitively via a functional unique
--     index on lower(name); the API also skips names that match a default.
--   * Staff-accessible (mirrors inventory_items): inserting an item with a new
--     category implicitly creates the category, and inventory is staff-level.
--   * Intentionally OUT of the realtime publication (refetched on mutation).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_categories_restaurant
  ON inventory_categories(restaurant_id);

-- Case-insensitive uniqueness per restaurant: "Spices" and "spices" collapse.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_categories_restaurant_name_lower
  ON inventory_categories(restaurant_id, lower(name));

-- ============================================
-- Row Level Security (staff-managed, mirrors inventory_items)
-- ============================================
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_categories_select_staff" ON inventory_categories;
CREATE POLICY "inventory_categories_select_staff"
  ON inventory_categories FOR SELECT
  USING (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "inventory_categories_insert_staff" ON inventory_categories;
CREATE POLICY "inventory_categories_insert_staff"
  ON inventory_categories FOR INSERT
  WITH CHECK (is_restaurant_staff(restaurant_id));

DROP POLICY IF EXISTS "inventory_categories_delete_staff" ON inventory_categories;
CREATE POLICY "inventory_categories_delete_staff"
  ON inventory_categories FOR DELETE
  USING (is_restaurant_staff(restaurant_id));
