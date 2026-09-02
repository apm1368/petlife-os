-- CreateEnum
CREATE TYPE "SellerMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'OPERATIONS', 'CATALOG_MANAGER', 'ORDER_MANAGER', 'FINANCE', 'SUPPORT', 'VIEWER');

-- CreateEnum
CREATE TYPE "SellerMembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('MANUAL_ADJUSTMENT', 'ORDER_RESERVATION', 'ORDER_RELEASE', 'ORDER_COMMIT', 'MARKETPLACE_ORDER', 'MARKETPLACE_CANCELLATION', 'RETURN', 'RECONCILIATION', 'IMPORT', 'SYSTEM_CORRECTION');

-- CreateEnum
CREATE TYPE "MarketplaceProvider" AS ENUM ('DEV', 'TOROB', 'DIGIKALA');

-- CreateEnum
CREATE TYPE "MarketplaceChannelAccountStatus" AS ENUM ('DISCONNECTED', 'PENDING', 'CONNECTED', 'DEGRADED', 'ERROR', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'REJECTED', 'ERROR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketplaceListingSyncStatus" AS ENUM ('NEVER_SYNCED', 'QUEUED', 'SYNCING', 'SYNCED', 'DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('RECEIVED', 'CONFIRMED', 'PROCESSING', 'READY_TO_FULFILL', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryResponsibility" AS ENUM ('PETLIFE', 'MARKETPLACE', 'SELLER', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "PaymentSourceType" AS ENUM ('PETLIFE_PAYMENT', 'MARKETPLACE_COLLECTED', 'CASH_ON_DELIVERY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MarketplaceSyncOperation" AS ENUM ('LISTING_PUBLISH', 'LISTING_UPDATE', 'LISTING_DEACTIVATE', 'PRICE_SYNC', 'INVENTORY_SYNC', 'ORDER_FETCH', 'ORDER_ACK', 'ORDER_CANCEL', 'RECONCILE');

-- CreateEnum
CREATE TYPE "MarketplaceSyncAttemptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SellerStatus" ADD VALUE 'PENDING';
ALTER TYPE "SellerStatus" ADD VALUE 'RESTRICTED';
ALTER TYPE "SellerStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "fulfillments" ADD COLUMN     "deliveryResponsibility" "DeliveryResponsibility" NOT NULL DEFAULT 'PETLIFE';

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "checkoutId" DROP NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "seller_offers" ADD COLUMN     "sellerSku" TEXT;

-- AlterTable
ALTER TABLE "seller_organizations" ADD COLUMN     "businessMetadata" JSONB,
ADD COLUMN     "defaultCurrency" TEXT NOT NULL DEFAULT 'IRR',
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "supportContactEmail" TEXT,
ADD COLUMN     "supportContactPhone" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran';

-- CreateTable
CREATE TABLE "seller_memberships" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "SellerMembershipRole" NOT NULL,
    "status" "SellerMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_context_preferences" (
    "userId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_context_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT,
    "reason" TEXT,
    "actorUserId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_channel_accounts" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "status" "MarketplaceChannelAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "externalSellerId" TEXT,
    "displayName" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inventorySyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priceSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "orderSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastAttemptedSyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_listings" (
    "id" UUID NOT NULL,
    "marketplaceChannelAccountId" UUID NOT NULL,
    "sellerOfferId" UUID NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "externalListingId" TEXT,
    "externalProductId" TEXT,
    "externalVariantId" TEXT,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'DRAFT',
    "syncStatus" "MarketplaceListingSyncStatus" NOT NULL DEFAULT 'NEVER_SYNCED',
    "publishedPriceIrr" INTEGER,
    "publishedInventory" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "lastProviderObservedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_orders" (
    "id" UUID NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "marketplaceChannelAccountId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "currency" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "deliveryResponsibility" "DeliveryResponsibility" NOT NULL DEFAULT 'MARKETPLACE',
    "paymentSource" "PaymentSourceType" NOT NULL DEFAULT 'UNKNOWN',
    "buyerSnapshot" JSONB,
    "shippingSnapshot" JSONB,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "providerUpdatedAt" TIMESTAMP(3),
    "mappedOrderId" UUID,
    "rawPayloadReference" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_order_items" (
    "id" UUID NOT NULL,
    "marketplaceOrderId" UUID NOT NULL,
    "marketplaceListingId" UUID,
    "sellerOfferId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceAmount" INTEGER NOT NULL,
    "totalPriceAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_sync_attempts" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "marketplaceChannelAccountId" UUID NOT NULL,
    "marketplaceListingId" UUID,
    "operation" "MarketplaceSyncOperation" NOT NULL,
    "status" "MarketplaceSyncAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "requestReference" TEXT,
    "responseSummary" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_sync_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_memberships_userId_idx" ON "seller_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_memberships_sellerOrganizationId_userId_key" ON "seller_memberships"("sellerOrganizationId", "userId");

-- CreateIndex
CREATE INDEX "inventory_movements_inventoryItemId_createdAt_idx" ON "inventory_movements"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_sellerOrganizationId_createdAt_idx" ON "inventory_movements"("sellerOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "marketplace_channel_accounts_provider_status_idx" ON "marketplace_channel_accounts"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_channel_accounts_sellerOrganizationId_provider_key" ON "marketplace_channel_accounts"("sellerOrganizationId", "provider");

-- CreateIndex
CREATE INDEX "marketplace_listings_provider_externalListingId_idx" ON "marketplace_listings"("provider", "externalListingId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_listings_marketplaceChannelAccountId_sellerOffe_key" ON "marketplace_listings"("marketplaceChannelAccountId", "sellerOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_mappedOrderId_key" ON "marketplace_orders"("mappedOrderId");

-- CreateIndex
CREATE INDEX "marketplace_orders_sellerOrganizationId_status_idx" ON "marketplace_orders"("sellerOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_provider_marketplaceChannelAccountId_ext_key" ON "marketplace_orders"("provider", "marketplaceChannelAccountId", "externalOrderId");

-- CreateIndex
CREATE INDEX "marketplace_order_items_marketplaceOrderId_idx" ON "marketplace_order_items"("marketplaceOrderId");

-- CreateIndex
CREATE INDEX "marketplace_sync_attempts_marketplaceChannelAccountId_creat_idx" ON "marketplace_sync_attempts"("marketplaceChannelAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "marketplace_sync_attempts_marketplaceListingId_idx" ON "marketplace_sync_attempts"("marketplaceListingId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_offers_sellerOrganizationId_sellerSku_key" ON "seller_offers"("sellerOrganizationId", "sellerSku");

-- CreateIndex
CREATE UNIQUE INDEX "seller_organizations_slug_key" ON "seller_organizations"("slug");

-- AddForeignKey
ALTER TABLE "seller_memberships" ADD CONSTRAINT "seller_memberships_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_memberships" ADD CONSTRAINT "seller_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_context_preferences" ADD CONSTRAINT "seller_context_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_channel_accounts" ADD CONSTRAINT "marketplace_channel_accounts_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_marketplaceChannelAccountId_fkey" FOREIGN KEY ("marketplaceChannelAccountId") REFERENCES "marketplace_channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_sellerOfferId_fkey" FOREIGN KEY ("sellerOfferId") REFERENCES "seller_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_marketplaceChannelAccountId_fkey" FOREIGN KEY ("marketplaceChannelAccountId") REFERENCES "marketplace_channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_mappedOrderId_fkey" FOREIGN KEY ("mappedOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_marketplaceOrderId_fkey" FOREIGN KEY ("marketplaceOrderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "marketplace_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_sellerOfferId_fkey" FOREIGN KEY ("sellerOfferId") REFERENCES "seller_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_sync_attempts" ADD CONSTRAINT "marketplace_sync_attempts_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_sync_attempts" ADD CONSTRAINT "marketplace_sync_attempts_marketplaceChannelAccountId_fkey" FOREIGN KEY ("marketplaceChannelAccountId") REFERENCES "marketplace_channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_sync_attempts" ADD CONSTRAINT "marketplace_sync_attempts_marketplaceListingId_fkey" FOREIGN KEY ("marketplaceListingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-added CHECK constraints (mirrors the Handoff 07/08 migrations' own
-- precedent — Prisma's DSL cannot express these).
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantityBefore_nonnegative" CHECK ("quantityBefore" >= 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantityAfter_nonnegative" CHECK ("quantityAfter" >= 0);
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_totalAmount_nonnegative" CHECK ("totalAmount" >= 0);
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_unitPriceAmount_nonnegative" CHECK ("unitPriceAmount" >= 0);
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_totalPriceAmount_nonnegative" CHECK ("totalPriceAmount" >= 0);
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_publishedPriceIrr_positive" CHECK ("publishedPriceIrr" IS NULL OR "publishedPriceIrr" > 0);
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_publishedInventory_nonnegative" CHECK ("publishedInventory" IS NULL OR "publishedInventory" >= 0);
ALTER TABLE "marketplace_sync_attempts" ADD CONSTRAINT "marketplace_sync_attempts_attemptNumber_positive" CHECK ("attemptNumber" > 0);

