-- CreateExtension

-- CreateEnum
CREATE TYPE "PromotionDiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('ALL', 'CATEGORY', 'PRODUCT', 'SELLER', 'SERVICE');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "PromotionFundedBy" AS ENUM ('PLATFORM', 'SELLER');

-- CreateEnum
CREATE TYPE "ProductReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "OrderRefundRequestStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RepeatDeliveryStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- DropIndex

-- AlterTable
ALTER TABLE "cart_lines" ADD COLUMN     "promotionIdSnapshot" UUID;

-- AlterTable
ALTER TABLE "customer_addresses" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postalCode" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "listUnitPrice" INTEGER,
ADD COLUMN     "promotionId" UUID,
ADD COLUMN     "promotionName" TEXT,
ADD COLUMN     "unitDiscount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "specifications" JSONB;

-- AlterTable
ALTER TABLE "seller_offers" ADD COLUMN     "repeatDeliveryEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repeatIntervalsDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "PromotionDiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscountAmount" INTEGER,
    "scope" "PromotionScope" NOT NULL,
    "categoryIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "productIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "sellerOrganizationIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "serviceIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "fundedBy" "PromotionFundedBy" NOT NULL DEFAULT 'PLATFORM',
    "ownerSellerOrganizationId" UUID,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" UUID NOT NULL,
    "promotionId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "userId" UUID,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "status" "ProductReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_favorites" (
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_favorites_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "order_status_events" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_refund_requests" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orderItemIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "requestedAmount" INTEGER NOT NULL,
    "status" "OrderRefundRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "decisionReason" TEXT,
    "decidedByAdminId" UUID,
    "adminRefundApprovalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repeat_delivery_schedules" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "sellerOfferId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "nextCycleAt" TIMESTAMP(3) NOT NULL,
    "addressId" UUID,
    "status" "RepeatDeliveryStatus" NOT NULL DEFAULT 'ACTIVE',
    "acceptedUnitPrice" INTEGER NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "lastOrderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repeat_delivery_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repeat_delivery_events" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repeat_delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_media_productId_sortOrder_idx" ON "product_media"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "promotions_status_startsAt_endsAt_idx" ON "promotions"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_redemptions_orderItemId_key" ON "promotion_redemptions"("orderItemId");

-- CreateIndex
CREATE INDEX "promotion_redemptions_promotionId_idx" ON "promotion_redemptions"("promotionId");

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_orderItemId_key" ON "product_reviews"("orderItemId");

-- CreateIndex
CREATE INDEX "product_reviews_productId_status_createdAt_idx" ON "product_reviews"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_events_orderId_createdAt_idx" ON "order_status_events"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_refund_requests_adminRefundApprovalId_key" ON "order_refund_requests"("adminRefundApprovalId");

-- CreateIndex
CREATE INDEX "order_refund_requests_status_createdAt_idx" ON "order_refund_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "order_refund_requests_orderId_idx" ON "order_refund_requests"("orderId");

-- CreateIndex
CREATE INDEX "repeat_delivery_schedules_status_nextCycleAt_idx" ON "repeat_delivery_schedules"("status", "nextCycleAt");

-- CreateIndex
CREATE INDEX "repeat_delivery_schedules_userId_idx" ON "repeat_delivery_schedules"("userId");

-- CreateIndex
CREATE INDEX "repeat_delivery_events_scheduleId_createdAt_idx" ON "repeat_delivery_events"("scheduleId", "createdAt");

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_favorites" ADD CONSTRAINT "product_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_favorites" ADD CONSTRAINT "product_favorites_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_refund_requests" ADD CONSTRAINT "order_refund_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_refund_requests" ADD CONSTRAINT "order_refund_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_schedules_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_schedules_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_schedules_sellerOfferId_fkey" FOREIGN KEY ("sellerOfferId") REFERENCES "seller_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_schedules_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_schedules_lastOrderId_fkey" FOREIGN KEY ("lastOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_delivery_events" ADD CONSTRAINT "repeat_delivery_events_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "repeat_delivery_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Batch 4 integrity rules Prisma's DSL cannot express.
-- ---------------------------------------------------------------------------
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_value_valid" CHECK (("discountType" = 'PERCENT' AND "value" BETWEEN 1 AND 90) OR ("discountType" = 'FIXED' AND "value" > 0));
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_window_valid" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_usage_within_limit" CHECK ("usageLimit" IS NULL OR "usageCount" <= "usageLimit");
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_discount_valid" CHECK ("unitDiscount" >= 0 AND "unitPrice" >= 0);
ALTER TABLE "order_refund_requests" ADD CONSTRAINT "order_refund_requests_amount_positive" CHECK ("requestedAmount" > 0);
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_quantity_range" CHECK ("quantity" BETWEEN 1 AND 20);
ALTER TABLE "repeat_delivery_schedules" ADD CONSTRAINT "repeat_delivery_interval_range" CHECK ("intervalDays" BETWEEN 7 AND 180);
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_postal_code_format" CHECK ("postalCode" IS NULL OR "postalCode" ~ '^[0-9]{10}$');

-- At most one default address per household.
CREATE UNIQUE INDEX "customer_addresses_one_default_per_household" ON "customer_addresses" ("householdId") WHERE "isDefault";
-- At most one live repeat schedule per customer and offer.
CREATE UNIQUE INDEX "repeat_delivery_one_live_per_offer" ON "repeat_delivery_schedules" ("userId", "sellerOfferId") WHERE "status" <> 'CANCELLED';
-- At most one open refund request per order at a time.
CREATE UNIQUE INDEX "order_refund_requests_one_open_per_order" ON "order_refund_requests" ("orderId") WHERE "status" = 'PENDING_REVIEW';

-- Checkout: priced lines frozen at creation (orders are built from this, not from the mutable cart)
ALTER TABLE "checkouts" ADD COLUMN "pricedLinesSnapshot" JSONB;
