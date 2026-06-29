-- Platform-level super admin (v1). This is a separate axis from restaurant
-- RBAC (owner/staff) — it spans all tenants, so it intentionally does not
-- live in staff_members and does not use restaurant_id at all.
--
-- All three new tables below have RLS enabled with zero policies attached.
-- In Postgres/Supabase the service_role connection bypasses RLS entirely, so
-- this combination makes them readable/writable ONLY via the service-role
-- admin client (src/lib/supabase/admin.ts) and completely invisible to the
-- anon/authenticated keys used by every customer- and staff-facing query.
-- Normal restaurant RLS is untouched.

-- ============================================
-- PLATFORM ADMINS
-- ============================================
-- There is no self-serve way to become a platform admin. Seed the first one
-- with a manual SQL insert (never run automatically, never exposed in the app):
--
--   INSERT INTO platform_admins (user_id) VALUES ('<auth.users.id-of-the-admin>');
--
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SUPPORT MESSAGES (public contact submissions)
-- ============================================
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  handled_at TIMESTAMPTZ,
  handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_messages_status_created
  ON support_messages(status, created_at DESC);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ADMIN AUDIT LOGS
-- ============================================
-- Kept separate from the existing per-restaurant audit_logs table (which is
-- fire-and-forget by design and NOT NULL on restaurant_id). Admin mutations
-- are the deliberate exception to fire-and-forget: callers must await this
-- write and surface failures, so it gets its own table rather than loosening
-- an existing constraint relied on elsewhere.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target
  ON admin_audit_logs(target_type, target_id, created_at DESC);

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SUBSCRIPTION/TRIAL METADATA (plain metadata only — no billing engine)
-- ============================================
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'paid'));
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ============================================
-- PROTECT ADMIN-ONLY FIELDS FROM OWNER TAMPERING
-- ============================================
-- restaurants.is_active is repurposed as the suspend/activate flag (it
-- already gated the public menu query pre-existing this feature). The
-- restaurants_update_owner RLS policy lets an owner UPDATE any column on
-- their own row, including is_active/plan/trial_ends_at — without this
-- trigger, an owner could un-suspend themselves or grant their own
-- restaurant a paid plan via a crafted client request. Service-role
-- connections (the admin API) are unaffected; only owner/staff sessions
-- (auth.role() = 'authenticated') get these three fields reverted.
CREATE OR REPLACE FUNCTION protect_restaurant_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    NEW.is_active := OLD.is_active;
    NEW.plan := OLD.plan;
    NEW.trial_ends_at := OLD.trial_ends_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_restaurant_admin_fields ON restaurants;
CREATE TRIGGER trg_protect_restaurant_admin_fields
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION protect_restaurant_admin_fields();
