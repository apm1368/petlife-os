
-- AlterTable
ALTER TABLE "chat_participants" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "community_comments" ADD COLUMN     "parentCommentId" UUID;

-- AlterTable
ALTER TABLE "community_posts" ADD COLUMN     "city" TEXT,
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "community_post_bookmarks" (
    "userId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_bookmarks_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "article_feedback" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_feedback_articleId_idx" ON "article_feedback"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "article_feedback_articleId_userId_key" ON "article_feedback"("articleId", "userId");

-- CreateIndex
CREATE INDEX "community_comments_parentCommentId_idx" ON "community_comments"("parentCommentId");

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_bookmarks" ADD CONSTRAINT "community_post_bookmarks_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_topics" CHECK ("topics" <@ ARRAY['DOGS', 'CATS', 'HEALTH', 'TRAINING', 'LOST_PETS', 'TRAVEL', 'ADOPTION', 'NUTRITION', 'OTHER']::text[] AND cardinality("topics") <= 3);
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_city_len" CHECK ("city" IS NULL OR char_length("city") BETWEEN 1 AND 80);
ALTER TABLE "article_feedback" ADD CONSTRAINT "article_feedback_reason_len" CHECK ("reason" IS NULL OR char_length("reason") <= 500);
CREATE INDEX "community_posts_topics_idx" ON "community_posts" USING GIN ("topics");
