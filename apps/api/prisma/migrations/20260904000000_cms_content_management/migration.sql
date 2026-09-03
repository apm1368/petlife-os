-- CreateEnum
CREATE TYPE "ArticleLifecycleStatus" AS ENUM ('DRAFT', 'VISIBLE', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentPlacementKey" AS ENUM ('LANDING_HERO', 'LANDING_FEATURED_CONTENT', 'HOME_EDUCATION', 'HOME_ANNOUNCEMENT');

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'EDITOR';

-- CreateTable
CREATE TABLE "content_authors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "avatarMediaAssetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_categories" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_category_locales" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_category_locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_tags" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_tag_locales" (
    "id" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_tag_locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_media_assets" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "altText" TEXT,
    "createdByAdminId" UUID NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_articles" (
    "id" UUID NOT NULL,
    "authorId" UUID,
    "categoryId" UUID,
    "coverMediaAssetId" UUID,
    "createdByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_article_locales" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "status" "ArticleLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" JSONB NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastEditedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_article_locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_article_tags" (
    "articleId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_article_tags_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "editorAdminId" UUID NOT NULL,
    "changeNote" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_placements" (
    "id" UUID NOT NULL,
    "key" "ContentPlacementKey" NOT NULL,
    "updatedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_blocks" (
    "id" UUID NOT NULL,
    "placementId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "linkedArticleId" UUID,
    "mediaAssetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_block_locales" (
    "id" UUID NOT NULL,
    "contentBlockId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "heading" TEXT,
    "body" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,

    CONSTRAINT "content_block_locales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_category_locales_categoryId_locale_key" ON "content_category_locales"("categoryId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "content_category_locales_locale_slug_key" ON "content_category_locales"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "content_tag_locales_tagId_locale_key" ON "content_tag_locales"("tagId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "content_tag_locales_locale_slug_key" ON "content_tag_locales"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "content_media_assets_key_key" ON "content_media_assets"("key");

-- CreateIndex
CREATE INDEX "content_articles_authorId_idx" ON "content_articles"("authorId");

-- CreateIndex
CREATE INDEX "content_articles_categoryId_idx" ON "content_articles"("categoryId");

-- CreateIndex
CREATE INDEX "content_article_locales_locale_status_idx" ON "content_article_locales"("locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_article_locales_articleId_locale_key" ON "content_article_locales"("articleId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "content_article_locales_locale_slug_key" ON "content_article_locales"("locale", "slug");

-- CreateIndex
CREATE INDEX "content_versions_articleId_locale_idx" ON "content_versions"("articleId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_articleId_locale_versionNumber_key" ON "content_versions"("articleId", "locale", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "content_placements_key_key" ON "content_placements"("key");

-- CreateIndex
CREATE UNIQUE INDEX "content_blocks_placementId_sortOrder_key" ON "content_blocks"("placementId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "content_block_locales_contentBlockId_locale_key" ON "content_block_locales"("contentBlockId", "locale");

-- AddForeignKey
ALTER TABLE "content_authors" ADD CONSTRAINT "content_authors_avatarMediaAssetId_fkey" FOREIGN KEY ("avatarMediaAssetId") REFERENCES "content_media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_category_locales" ADD CONSTRAINT "content_category_locales_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "content_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_tag_locales" ADD CONSTRAINT "content_tag_locales_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "content_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media_assets" ADD CONSTRAINT "content_media_assets_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "content_authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "content_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_coverMediaAssetId_fkey" FOREIGN KEY ("coverMediaAssetId") REFERENCES "content_media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_articles" ADD CONSTRAINT "content_articles_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_article_locales" ADD CONSTRAINT "content_article_locales_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "content_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_article_locales" ADD CONSTRAINT "content_article_locales_lastEditedByAdminId_fkey" FOREIGN KEY ("lastEditedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_article_tags" ADD CONSTRAINT "content_article_tags_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "content_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_article_tags" ADD CONSTRAINT "content_article_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "content_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "content_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_editorAdminId_fkey" FOREIGN KEY ("editorAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_placements" ADD CONSTRAINT "content_placements_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "content_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_linkedArticleId_fkey" FOREIGN KEY ("linkedArticleId") REFERENCES "content_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "content_media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_block_locales" ADD CONSTRAINT "content_block_locales_contentBlockId_fkey" FOREIGN KEY ("contentBlockId") REFERENCES "content_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

