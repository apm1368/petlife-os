-- M6: authors may edit and delete their own community posts and comments.
ALTER TABLE "community_posts" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "community_posts" ADD COLUMN IF NOT EXISTS "removedByAuthorAt" TIMESTAMP(3);
ALTER TABLE "community_comments" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "community_comments" ADD COLUMN IF NOT EXISTS "removedByAuthorAt" TIMESTAMP(3);
