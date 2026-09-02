-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SECURITY', 'HEALTH', 'BOOKING', 'SERVICE', 'PAYMENT', 'COMMERCE', 'DELIVERY', 'SELLER', 'MARKETPLACE', 'HOUSEHOLD', 'PET_ACCESS', 'SYSTEM', 'MARKETING');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationFailureKind" AS ENUM ('TRANSIENT', 'PERMANENT');

-- CreateEnum
CREATE TYPE "MessagingProvider" AS ENUM ('DEV', 'FARAZ');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID,
    "petId" UUID,
    "sellerOrganizationId" UUID,
    "domainEventId" UUID,
    "type" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "deepLink" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "actorType" TEXT,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "provider" "MessagingProvider",
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "destinationMasked" TEXT,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureKind" "NotificationFailureKind",
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_quiet_hours" (
    "userId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT NOT NULL DEFAULT '22:00',
    "endTime" TEXT NOT NULL DEFAULT '08:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_quiet_hours_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_sellerOrganizationId_idx" ON "notifications"("sellerOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_domainEventId_type_userId_key" ON "notifications"("domainEventId", "type", "userId");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_scheduledAt_idx" ON "notification_deliveries"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_provider_providerMessageId_idx" ON "notification_deliveries"("provider", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_key" ON "notification_deliveries"("notificationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_category_channel_key" ON "notification_preferences"("userId", "category", "channel");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_quiet_hours" ADD CONSTRAINT "notification_quiet_hours_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-appended CHECK constraints (Prisma's DSL cannot express these):
-- attemptCount must never go negative (mirrors every other attempt/quantity
-- counter's own CHECK across Handoffs 08-09).
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_attempt_count_nonnegative" CHECK ("attemptCount" >= 0);

-- startTime/endTime are always a strict 24h "HH:mm" string — enforced at the
-- database layer, not just in application validation, since these values
-- drive real send/defer decisions.
ALTER TABLE "notification_quiet_hours" ADD CONSTRAINT "notification_quiet_hours_start_time_format" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "notification_quiet_hours" ADD CONSTRAINT "notification_quiet_hours_end_time_format" CHECK ("endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
