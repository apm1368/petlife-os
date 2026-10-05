

-- CreateTable
CREATE TABLE "notification_digest_preferences" (
    "userId" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'INSTANT',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_digest_preferences_pkey" PRIMARY KEY ("userId","group")
);


ALTER TABLE "notification_digest_preferences" ADD CONSTRAINT "notification_digest_preferences_mode" CHECK ("mode" IN ('INSTANT', 'DAILY', 'OFF'));
ALTER TABLE "notification_digest_preferences" ADD CONSTRAINT "notification_digest_preferences_group" CHECK ("group" IN ('HEALTH', 'CARE', 'BOOKING', 'ORDER', 'TRAVEL', 'COMMUNITY', 'SUPPORT', 'CLINIC', 'SUBSCRIPTION', 'SECURITY', 'OTHER'));
