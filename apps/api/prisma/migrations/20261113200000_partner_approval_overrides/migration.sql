-- Approval modes (owner request 2026-11-13): orders and bookings run INSTANT or NEEDS_APPROVAL, set per vertical in
-- the settings registry (approvals.mode.*) with a per-partner override here. Additive only; nothing changes for
-- existing rows until an admin picks a mode (the defaults keep today's behaviour).

-- CreateEnum
CREATE TYPE "ApprovalScope" AS ENUM ('SERVICE_BOOKINGS', 'STAY_BOOKINGS', 'SHOP_ORDERS');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('INSTANT', 'NEEDS_APPROVAL');

-- AlterEnum: follow-up tasks for requests waiting on a partner and for shop orders held for staff approval.
ALTER TYPE "AdminTaskSource" ADD VALUE 'BOOKING_APPROVAL';
ALTER TYPE "AdminTaskSource" ADD VALUE 'ORDER_APPROVAL';

-- AlterTable: the stay's booking mode as it was when the dates were held (null = read the listing, as before).
ALTER TABLE "travel_bookings" ADD COLUMN "bookingMode" "TravelBookingMode";

-- CreateTable
CREATE TABLE "partner_approval_overrides" (
    "id" UUID NOT NULL,
    "partnerType" "PartnerSubjectType" NOT NULL,
    "organizationId" UUID NOT NULL,
    "scope" "ApprovalScope" NOT NULL,
    "mode" "ApprovalMode" NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_approval_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_approval_overrides_partnerType_organizationId_scope_key" ON "partner_approval_overrides"("partnerType", "organizationId", "scope");
