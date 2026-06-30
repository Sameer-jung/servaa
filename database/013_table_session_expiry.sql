-- Customer "dining session" expiry (20 hours, sliding on rescan).
--
-- The table token printed in a QR code (tables.qr_token_hash) is intentionally
-- long-lived — it identifies a physical sticker that shouldn't need
-- reprinting on a routine basis. But that means the token alone never expires:
-- a customer who keeps a tab open (or a link/photo of the QR) could otherwise
-- keep placing orders under that table indefinitely.
--
-- table_sessions tracks, per (table, customer browser), when their current
-- 20-hour ordering window expires. It is bookkeeping only — re-presenting a
-- valid table token (e.g. by reloading the menu link) always refreshes it,
-- the same way physically rescanning the QR code would. It does not replace
-- the table-token check anywhere; it is an additional, narrower gate applied
-- only to customer-initiated writes (placing an order, sending a service
-- request). Read-only customer endpoints (bill summary, order status, order
-- session) are deliberately not gated by this table, since a customer should
-- still be able to check on an existing order or unpaid bill after their
-- ordering window lapses.
--
-- RLS enabled with zero policies (same pattern as platform_admins in
-- 011_super_admin.sql): readable/writable only via the service-role admin
-- client, invisible to the anon/authenticated keys.
CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  customer_session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (table_id, customer_session_id)
);

ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
