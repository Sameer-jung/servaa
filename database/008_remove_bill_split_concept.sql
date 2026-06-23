-- ============================================
-- Migration 008: Remove bill split-by-people concept
-- ============================================
-- Product decision: splitting a bill into named people/items (equal or
-- by-item) is replaced by recording a bill's payment across multiple
-- methods directly (e.g. part cash, part online) via repeated inserts into
-- `payments` — no intermediate "split" entity needed. Drops the
-- bill_splits/bill_split_parts/bill_split_items tables added in 007 and the
-- now-unused payments.bill_split_part_id column. bills, bill_orders, and
-- payments (amount + method ledger) are unaffected.
--
-- Idempotent: safe to re-run.

-- Drop first: payments.bill_split_part_id_fkey depends on bill_split_parts,
-- so the table drop below would otherwise fail.
ALTER TABLE payments DROP COLUMN IF EXISTS bill_split_part_id;

DROP TABLE IF EXISTS bill_split_items;
DROP TABLE IF EXISTS bill_split_parts;
DROP TABLE IF EXISTS bill_splits;
