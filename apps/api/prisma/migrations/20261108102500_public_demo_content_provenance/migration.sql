-- Public content seeds are intended only for test and QA environments. Keep
-- their provenance on the article itself so production reads can exclude
-- them without hiding genuine editorial content.
ALTER TABLE "content_articles"
  ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT FALSE;

-- The guarded content demo seed uses this dedicated suspended editor account.
-- Mark only articles created by that identity; do not infer demo status from
-- titles, authors, or ordinary editorial metadata.
UPDATE "content_articles" AS article
SET "isDemoRecord" = TRUE
WHERE article."createdByAdminId" IN (
  SELECT admin."id"
  FROM "admin_users" AS admin
  INNER JOIN "users" AS account ON account."id" = admin."userId"
  WHERE account."email" = 'content-demo-editor@example.test'
);
