-- Safe Refactor v1 additive migration.
-- Apply after the existing schema.sql and rls_policies.sql.

ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_code_data_url TEXT;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_url TEXT;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_token_hash TEXT;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_token_created_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tables_qr_token_hash ON tables(qr_token_hash);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_session_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_request
  ON orders(restaurant_id, table_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_table_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS acknowledged_by_table_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS table_session_token_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_sent_to_table ON invoices(sent_to_table_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_request_type') THEN
    CREATE TYPE service_request_type AS ENUM ('water', 'bill');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_request_status') THEN
    CREATE TYPE service_request_status AS ENUM ('pending', 'acknowledged', 'completed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  request_type service_request_type NOT NULL,
  status service_request_status DEFAULT 'pending',
  notes TEXT,
  legacy_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_restaurant ON service_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_table ON service_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);

ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE staff_members
  ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('owner', 'staff'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_service_requests_updated_at'
      AND tgrelid = 'service_requests'::regclass
  ) THEN
    CREATE TRIGGER update_service_requests_updated_at
      BEFORE UPDATE ON service_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_requests'
      AND policyname = 'service_requests_insert_public'
  ) THEN
    CREATE POLICY "service_requests_insert_public"
      ON service_requests FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_requests'
      AND policyname = 'service_requests_select_staff'
  ) THEN
    CREATE POLICY "service_requests_select_staff"
      ON service_requests FOR SELECT
      USING (is_restaurant_staff(restaurant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_requests'
      AND policyname = 'service_requests_update_staff'
  ) THEN
    CREATE POLICY "service_requests_update_staff"
      ON service_requests FOR UPDATE
      USING (is_restaurant_staff(restaurant_id))
      WITH CHECK (is_restaurant_staff(restaurant_id));
  END IF;
END $$;
