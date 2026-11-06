-- CUSTOM is an effective session role only. It may never be persisted as the
-- built-in AdminUser.role value; PostgreSQL requires the enum addition to be
-- committed before using it in a constraint.
ALTER TABLE "admin_users"
  ADD CONSTRAINT "admin_users_effective_custom_role_only_check"
  CHECK ("role" <> 'CUSTOM');
