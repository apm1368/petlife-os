-- Help Center, legal documents, system status and support escalation.
--
-- Additive only: new enums and new tables, nothing else. No existing table is altered and nothing is
-- dropped. (The raw-SQL indexes that `prisma migrate diff` reports as "to drop" — community_posts_topics_idx,
-- pet_friendly_places_location_gist_idx and the three *_reviews_status_createdAt_idx — are hand-written
-- indexes that schema.prisma does not model; they are deliberately left in place.)

-- CreateEnum
CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'COOKIE_CONSENT', 'COMMUNITY_GUIDELINES', 'ANIMAL_WELFARE', 'AI_AND_SAFETY', 'PAYMENT_AND_REFUND', 'DELIVERY', 'INSTALLMENT_HELP', 'ACCESSIBILITY');

-- CreateEnum
CREATE TYPE "SystemIncidentStatus" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SystemIncidentImpact" AS ENUM ('NONE', 'MINOR', 'MAJOR', 'CRITICAL');

-- CreateTable
CREATE TABLE "help_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "titleFa" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionFa" TEXT,
    "descriptionEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_articles" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "contextKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFaq" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedVersion" INTEGER,
    "createdByAdminId" UUID NOT NULL,
    "updatedByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_article_versions" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "editorAdminId" UUID NOT NULL,
    "changeNote" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "locale" "Locale" NOT NULL,
    "publishedVersion" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "editorAdminId" UUID NOT NULL,
    "changeNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_incidents" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SystemIncidentStatus" NOT NULL DEFAULT 'INVESTIGATING',
    "impact" "SystemIncidentImpact" NOT NULL DEFAULT 'MINOR',
    "components" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_incident_updates" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "status" "SystemIncidentStatus" NOT NULL,
    "body" TEXT NOT NULL,
    "authorAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_windows" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_escalations" (
    "id" UUID NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "caseId" UUID NOT NULL,
    "requesterUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "help_categories_slug_key" ON "help_categories"("slug");

-- CreateIndex
CREATE INDEX "help_categories_isActive_sortOrder_idx" ON "help_categories"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "help_articles_categoryId_locale_status_idx" ON "help_articles"("categoryId", "locale", "status");

-- CreateIndex
CREATE INDEX "help_articles_locale_status_isFaq_idx" ON "help_articles"("locale", "status", "isFaq");

-- CreateIndex
CREATE UNIQUE INDEX "help_articles_locale_slug_key" ON "help_articles"("locale", "slug");

-- CreateIndex
CREATE INDEX "help_article_versions_articleId_idx" ON "help_article_versions"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "help_article_versions_articleId_versionNumber_key" ON "help_article_versions"("articleId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_kind_locale_key" ON "legal_documents"("kind", "locale");

-- CreateIndex
CREATE INDEX "legal_document_versions_documentId_idx" ON "legal_document_versions"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_versions_documentId_versionNumber_key" ON "legal_document_versions"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "system_incidents_status_startedAt_idx" ON "system_incidents"("status", "startedAt");

-- CreateIndex
CREATE INDEX "system_incident_updates_incidentId_createdAt_idx" ON "system_incident_updates"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "maintenance_windows_startsAt_endsAt_idx" ON "maintenance_windows"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_escalations_referenceNumber_key" ON "support_escalations"("referenceNumber");

-- CreateIndex
CREATE INDEX "support_escalations_caseId_idx" ON "support_escalations"("caseId");

-- CreateIndex
CREATE INDEX "support_escalations_requesterUserId_idx" ON "support_escalations"("requesterUserId");

-- AddForeignKey
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "help_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_article_versions" ADD CONSTRAINT "help_article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "help_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_incident_updates" ADD CONSTRAINT "system_incident_updates_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "system_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reference numbers shown to a member who asks to reach a person ("ESC-000123"). A sequence of its own,
-- so a hand-off never consumes a support-case number and the two series cannot be mistaken for each other.
CREATE SEQUENCE IF NOT EXISTS "support_escalation_number_seq" START WITH 1 INCREMENT BY 1;
