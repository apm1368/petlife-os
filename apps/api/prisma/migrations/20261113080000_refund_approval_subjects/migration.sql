-- Staff refunds of service bookings and travel stays go through the same two-person refund approvals as orders.

-- CreateEnum
CREATE TYPE "AdminRefundSubjectType" AS ENUM ('ORDER', 'BOOKING', 'TRAVEL_BOOKING');

-- AlterTable
ALTER TABLE "admin_refund_approvals" ADD COLUMN "subjectType" "AdminRefundSubjectType" NOT NULL DEFAULT 'ORDER',
ADD COLUMN "bookingId" UUID,
ADD COLUMN "travelBookingId" UUID,
ALTER COLUMN "orderId" DROP NOT NULL;

-- Exactly the id that matches the subject is set.
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_subject_check" CHECK (
  ("subjectType" = 'ORDER' AND "orderId" IS NOT NULL AND "bookingId" IS NULL AND "travelBookingId" IS NULL)
  OR ("subjectType" = 'BOOKING' AND "bookingId" IS NOT NULL AND "orderId" IS NULL AND "travelBookingId" IS NULL)
  OR ("subjectType" = 'TRAVEL_BOOKING' AND "travelBookingId" IS NOT NULL AND "orderId" IS NULL AND "bookingId" IS NULL)
);

-- CreateIndex
CREATE INDEX "admin_refund_approvals_bookingId_idx" ON "admin_refund_approvals"("bookingId");
CREATE INDEX "admin_refund_approvals_travelBookingId_idx" ON "admin_refund_approvals"("travelBookingId");

-- AddForeignKey
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_travelBookingId_fkey" FOREIGN KEY ("travelBookingId") REFERENCES "travel_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
