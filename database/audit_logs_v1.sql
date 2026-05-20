-- Audit logs v1 additive migration.
-- Keeps staff roles limited to owner/staff and adds lightweight business audit logging.

UPDATE staff_members
SET role = 'staff'
WHERE role IS NULL OR role NOT IN ('owner', 'staff');

ALTER TABLE staff_members ALTER COLUMN role SET DEFAULT 'staff';
ALTER TABLE staff_members ALTER COLUMN role SET NOT NULL;
ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE staff_members
  ADD CONSTRAINT staff_members_role_check
  CHECK (role IN ('owner', 'staff'));

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant ON audit_logs(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_insert_staff'
  ) THEN
    CREATE POLICY "audit_logs_insert_staff"
      ON audit_logs FOR INSERT
      WITH CHECK (is_restaurant_staff(restaurant_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_select_staff'
  ) THEN
    CREATE POLICY "audit_logs_select_staff"
      ON audit_logs FOR SELECT
      USING (is_restaurant_staff(restaurant_id));
  END IF;
END $$;
