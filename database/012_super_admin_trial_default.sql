-- Closes a gap in 011_super_admin.sql: protect_restaurant_admin_fields only
-- fired on UPDATE, so it protected existing rows from owner tampering but
-- did nothing on INSERT. restaurants_insert_owner (rls_policies.sql) only
-- checks `auth.uid() = owner_id` — it does not restrict which columns an
-- owner's own insert can set. Without this, an owner could self-insert a
-- restaurant row with plan: 'paid' or is_active: true via a crafted request,
-- bypassing the admin entirely. This also gives every new restaurant a real
-- 14-day trial window instead of an indefinite/unset one, enforced at the DB
-- level so it can't be skipped by any current or future insert path.
CREATE OR REPLACE FUNCTION protect_restaurant_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_active := true;
    NEW.plan := 'trial';
    NEW.trial_ends_at := NOW() + INTERVAL '14 days';
    RETURN NEW;
  END IF;

  NEW.is_active := OLD.is_active;
  NEW.plan := OLD.plan;
  NEW.trial_ends_at := OLD.trial_ends_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_restaurant_admin_fields ON restaurants;
CREATE TRIGGER trg_protect_restaurant_admin_fields
  BEFORE INSERT OR UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION protect_restaurant_admin_fields();
