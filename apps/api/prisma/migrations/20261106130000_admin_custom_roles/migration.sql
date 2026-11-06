ALTER TYPE "AdminRole" ADD VALUE 'CUSTOM';
CREATE TYPE "AdminCustomRoleStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');
CREATE TYPE "AdminRoleAssignmentStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED');

ALTER TABLE "admin_users" ADD COLUMN "customRoleId" UUID;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_custom_role_read_only_check" CHECK ("customRoleId" IS NULL OR "role" = 'READ_ONLY');

CREATE TABLE "admin_custom_roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "permissions" TEXT[] NOT NULL,
    "verticals" "AdminVertical"[] NOT NULL DEFAULT ARRAY[]::"AdminVertical"[],
    "status" "AdminCustomRoleStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedByAdminId" UUID NOT NULL,
    "approvedByAdminId" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_custom_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_custom_roles_key_check" CHECK ("key" ~ '^[a-z][a-z0-9-]{1,39}$'),
    CONSTRAINT "admin_custom_roles_permissions_check" CHECK (cardinality("permissions") > 0 AND NOT ('admin.manage' = ANY("permissions"))),
    CONSTRAINT "admin_custom_roles_verticals_check" CHECK (cardinality("verticals") > 0),
    CONSTRAINT "admin_custom_roles_approval_check" CHECK (
      ("status" = 'PENDING' AND "approvedByAdminId" IS NULL AND "approvedAt" IS NULL)
      OR ("status" IN ('ACTIVE', 'REJECTED') AND "approvedByAdminId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedByAdminId" <> "requestedByAdminId")
    )
);

CREATE TABLE "admin_role_assignments" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "customRoleId" UUID,
    "status" "AdminRoleAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedByAdminId" UUID NOT NULL,
    "approvedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "admin_role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_role_assignments_approval_check" CHECK (
      ("status" = 'PENDING' AND "approvedByAdminId" IS NULL AND "reviewedAt" IS NULL)
      OR ("status" IN ('APPLIED', 'REJECTED', 'CANCELLED') AND "approvedByAdminId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "approvedByAdminId" <> "requestedByAdminId")
    )
);

CREATE UNIQUE INDEX "admin_custom_roles_key_key" ON "admin_custom_roles"("key");
CREATE INDEX "admin_custom_roles_status_createdAt_idx" ON "admin_custom_roles"("status", "createdAt");
CREATE INDEX "admin_role_assignments_status_createdAt_idx" ON "admin_role_assignments"("status", "createdAt");
CREATE INDEX "admin_role_assignments_adminUserId_createdAt_idx" ON "admin_role_assignments"("adminUserId", "createdAt");

ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "admin_custom_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "admin_custom_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_admin_custom_role_definition_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."key" IS DISTINCT FROM OLD."key"
    OR NEW."label" IS DISTINCT FROM OLD."label"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR NEW."permissions" IS DISTINCT FROM OLD."permissions"
    OR NEW."verticals" IS DISTINCT FROM OLD."verticals"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."requestedByAdminId" IS DISTINCT FROM OLD."requestedByAdminId"
  THEN
    RAISE EXCEPTION 'admin custom role definitions are immutable; create a new role definition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "admin_custom_roles_definition_immutable"
  BEFORE UPDATE ON "admin_custom_roles"
  FOR EACH ROW EXECUTE FUNCTION reject_admin_custom_role_definition_rewrite();

CREATE FUNCTION reject_admin_role_assignment_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."adminUserId" IS DISTINCT FROM OLD."adminUserId"
    OR NEW."customRoleId" IS DISTINCT FROM OLD."customRoleId"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."requestedByAdminId" IS DISTINCT FROM OLD."requestedByAdminId"
  THEN
    RAISE EXCEPTION 'admin role assignment requests are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "admin_role_assignments_request_immutable"
  BEFORE UPDATE ON "admin_role_assignments"
  FOR EACH ROW EXECUTE FUNCTION reject_admin_role_assignment_rewrite();
