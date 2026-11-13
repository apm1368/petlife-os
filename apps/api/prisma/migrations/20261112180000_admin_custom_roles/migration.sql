-- Owner-defined admin roles (admin/access/roles): a named permission set, optionally limited to verticals.
CREATE TABLE "admin_custom_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] NOT NULL,
    "verticals" "AdminVertical"[] NOT NULL DEFAULT ARRAY[]::"AdminVertical"[],
    "archivedAt" TIMESTAMP(3),
    "createdByAdminId" UUID NOT NULL,
    "updatedByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_custom_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_custom_roles_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 60),
    -- Role management is never delegable: a custom role cannot carry admin.manage.
    CONSTRAINT "admin_custom_roles_permissions_check" CHECK (cardinality("permissions") > 0 AND NOT ('admin.manage' = ANY("permissions")))
);
CREATE INDEX "admin_custom_roles_archivedAt_idx" ON "admin_custom_roles"("archivedAt");
-- One live role per name (case-insensitive); archived names can be reused.
CREATE UNIQUE INDEX "admin_custom_roles_live_name_key" ON "admin_custom_roles"(lower(btrim("name"))) WHERE "archivedAt" IS NULL;

ALTER TABLE "admin_users" ADD COLUMN "customRoleId" UUID;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "admin_custom_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- A SUPER_ADMIN always keeps the full built-in role (the last-super-admin invariant depends on it).
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_custom_role_not_super_admin_check" CHECK ("customRoleId" IS NULL OR "role" <> 'SUPER_ADMIN');
CREATE INDEX "admin_users_customRoleId_idx" ON "admin_users"("customRoleId");
