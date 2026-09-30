-- Batch 8 — contact verification timestamps.
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Backfill only what is provable from existing data:
-- a phone can only ever be set by a successful OTP verification;
UPDATE "users" SET "phoneVerifiedAt" = "createdAt" WHERE "phone" IS NOT NULL;
-- an email is proven when it came from OTP sign-in (account without a password) or matches a Google identity.
UPDATE "users" u SET "emailVerifiedAt" = u."createdAt"
WHERE u."email" IS NOT NULL
  AND (u."passwordHash" IS NULL OR EXISTS (SELECT 1 FROM "auth_identities" a WHERE a."userId" = u."id" AND a."provider" = 'GOOGLE' AND lower(a."email") = lower(u."email")));
