-- CreateEnum
CREATE TYPE "BookingAttachmentSide" AS ENUM ('OWNER', 'PROVIDER');


-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "aftercareInstructions" TEXT,
ADD COLUMN     "intakeAnswers" JSONB,
ADD COLUMN     "intakeFormId" UUID;

-- CreateTable
CREATE TABLE "service_intake_forms" (
    "id" UUID NOT NULL,
    "providerServiceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByProviderUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_intake_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_attachments" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "side" "BookingAttachmentSide" NOT NULL,
    "uploadedByUserId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "title" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_intake_forms_providerServiceId_version_key" ON "service_intake_forms"("providerServiceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "booking_attachments_objectKey_key" ON "booking_attachments"("objectKey");

-- CreateIndex
CREATE INDEX "booking_attachments_bookingId_idx" ON "booking_attachments"("bookingId");

-- AddForeignKey
ALTER TABLE "service_intake_forms" ADD CONSTRAINT "service_intake_forms_providerServiceId_fkey" FOREIGN KEY ("providerServiceId") REFERENCES "provider_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_attachments" ADD CONSTRAINT "booking_attachments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE UNIQUE INDEX "service_intake_forms_one_active" ON "service_intake_forms" ("providerServiceId") WHERE "isActive";
ALTER TABLE "booking_attachments" ADD CONSTRAINT "booking_attachments_size" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 20971520);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_aftercare_len" CHECK ("aftercareInstructions" IS NULL OR char_length("aftercareInstructions") <= 2000);
