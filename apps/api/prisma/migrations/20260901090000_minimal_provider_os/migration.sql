-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedByProviderUserId" UUID,
ADD COLUMN     "completionNote" TEXT;

-- CreateTable
CREATE TABLE "provider_context_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_context_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_provider_notes" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "providerUserId" UUID,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_provider_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_context_preferences_userId_key" ON "provider_context_preferences"("userId");

-- CreateIndex
CREATE INDEX "booking_provider_notes_bookingId_idx" ON "booking_provider_notes"("bookingId");

-- AddForeignKey
ALTER TABLE "provider_context_preferences" ADD CONSTRAINT "provider_context_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_context_preferences" ADD CONSTRAINT "provider_context_preferences_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_provider_notes" ADD CONSTRAINT "booking_provider_notes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_provider_notes" ADD CONSTRAINT "booking_provider_notes_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

