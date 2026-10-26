-- W2-4: scoped admin roles.
--
-- Additive only. The four new AdminRole values are appended, so no existing row changes meaning,
-- and "admin_users"."serviceScopes" arrives with a default of an empty array, so every row already
-- in the table gets a valid value without a table rewrite or a NOT NULL backfill. An empty array
-- means "this role's own verticals decide" for every role except SERVICE_ADMIN, which is new and
-- therefore has no existing rows to misread.

ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'CONTENT_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'SHOP_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'SERVICE_ADMIN';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'SUPPORT_AGENT';

CREATE TYPE "AdminVertical" AS ENUM ('CLINIC', 'GROOMING', 'ACCOMMODATION', 'INSURANCE', 'SHOP', 'CONTENT', 'SUPPORT');

ALTER TABLE "admin_users" ADD COLUMN "serviceScopes" "AdminVertical"[] NOT NULL DEFAULT ARRAY[]::"AdminVertical"[];
