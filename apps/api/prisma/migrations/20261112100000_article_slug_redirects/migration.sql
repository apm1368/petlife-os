-- Owner request (2026-11-11): article addresses are built in the admin editor and go live on publish. When a
-- published article's slug is renamed, its old address keeps working as a permanent redirect to the new one.
CREATE TABLE "content_article_slug_redirects" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_article_slug_redirects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_article_slug_redirects_locale_slug_key" ON "content_article_slug_redirects"("locale", "slug");
CREATE INDEX "content_article_slug_redirects_articleId_idx" ON "content_article_slug_redirects"("articleId");

ALTER TABLE "content_article_slug_redirects" ADD CONSTRAINT "content_article_slug_redirects_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "content_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
