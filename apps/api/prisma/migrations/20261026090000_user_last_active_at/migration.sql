-- W2-5: a coarse "last active" stamp for the admin users directory.
--
-- Additive and nullable: existing rows start as NULL ("never seen since this shipped") and are filled
-- in lazily the next time each user's session resolves. No backfill, no table rewrite, no NOT NULL.

ALTER TABLE "users" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
