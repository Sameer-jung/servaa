-- ============================================
-- Migration 003: Item Name Snapshot
-- Stores menu item name at order time so history
-- is preserved even if the item is later deleted.
-- ============================================

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_name_snapshot TEXT;

-- Backfill existing rows
UPDATE order_items
SET item_name_snapshot = menu_items.name
FROM menu_items
WHERE order_items.menu_item_id = menu_items.id;

-- Change FK from RESTRICT to SET NULL so deleting a menu item
-- (or cascading from a user/restaurant delete) no longer blocks
ALTER TABLE order_items
  DROP CONSTRAINT order_items_menu_item_id_fkey,
  ADD CONSTRAINT order_items_menu_item_id_fkey
    FOREIGN KEY (menu_item_id)
    REFERENCES menu_items(id)
    ON DELETE SET NULL;

ALTER TABLE order_items
  ALTER COLUMN menu_item_id DROP NOT NULL;
