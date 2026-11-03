CREATE TABLE "sms_pattern_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "displayName" TEXT NOT NULL,
    "farazPatternCode" TEXT NOT NULL,
    "bodyAttributeKey" TEXT NOT NULL DEFAULT 'message',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sms_pattern_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_pattern_templates_key_locale_key" ON "sms_pattern_templates"("key", "locale");
CREATE INDEX "sms_pattern_templates_isActive_idx" ON "sms_pattern_templates"("isActive");
