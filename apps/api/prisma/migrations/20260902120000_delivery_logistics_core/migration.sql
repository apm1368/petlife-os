-- CreateEnum
CREATE TYPE "ShippingProvider" AS ENUM ('DEV', 'ALOPEYK', 'SNAPPBOX');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('STANDARD_DELIVERY');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'AWAITING_SELLER_PREPARATION', 'READY_FOR_PICKUP', 'PICKUP_REQUESTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'REQUESTED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ShippingQuoteStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'EXPIRED', 'SELECTED');

-- CreateTable
CREATE TABLE "shipping_quotes" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "sellerOrgId" UUID NOT NULL,
    "orderId" UUID,
    "provider" "ShippingProvider" NOT NULL,
    "serviceLevel" TEXT NOT NULL,
    "priceIrr" INTEGER NOT NULL,
    "estimatedPickupMinutes" INTEGER,
    "estimatedDeliveryMinutes" INTEGER,
    "providerQuoteId" TEXT,
    "status" "ShippingQuoteStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "providerPayloadSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sellerOrgId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'STANDARD_DELIVERY',
    "pickupAddressSnapshot" JSONB NOT NULL,
    "deliveryAddressSnapshot" JSONB NOT NULL,
    "readyAt" TIMESTAMP(3),
    "pickupRequestedAt" TIMESTAMP(3),
    "pickupAssignedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "outForDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "fulfillmentId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 1,
    "provider" "ShippingProvider" NOT NULL,
    "providerShipmentId" TEXT,
    "providerQuoteId" TEXT,
    "trackingCode" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "pickupAddressSnapshot" JSONB NOT NULL,
    "deliveryAddressSnapshot" JSONB NOT NULL,
    "estimatedPickupAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "actualPickupAt" TIMESTAMP(3),
    "actualDeliveryAt" TIMESTAMP(3),
    "rawProviderStatus" TEXT,
    "providerPayloadSnapshot" JSONB,
    "lastReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "provider" "ShippingProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerStatus" TEXT,
    "canonicalStatus" "ShipmentStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipping_quotes_checkoutId_idx" ON "shipping_quotes"("checkoutId");

-- CreateIndex
CREATE INDEX "shipping_quotes_sellerOrgId_idx" ON "shipping_quotes"("sellerOrgId");

-- CreateIndex
CREATE INDEX "shipping_quotes_orderId_idx" ON "shipping_quotes"("orderId");

-- CreateIndex
CREATE INDEX "shipping_quotes_status_idx" ON "shipping_quotes"("status");

-- CreateIndex
CREATE INDEX "shipping_quotes_expiresAt_idx" ON "shipping_quotes"("expiresAt");

-- CreateIndex
CREATE INDEX "fulfillments_orderId_idx" ON "fulfillments"("orderId");

-- CreateIndex
CREATE INDEX "fulfillments_sellerOrgId_idx" ON "fulfillments"("sellerOrgId");

-- CreateIndex
CREATE INDEX "fulfillments_status_idx" ON "fulfillments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillments_orderId_sequenceNumber_key" ON "fulfillments"("orderId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "shipments_fulfillmentId_idx" ON "shipments"("fulfillmentId");

-- CreateIndex
CREATE INDEX "shipments_provider_idx" ON "shipments"("provider");

-- CreateIndex
CREATE INDEX "shipments_providerShipmentId_idx" ON "shipments"("providerShipmentId");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE INDEX "shipments_trackingCode_idx" ON "shipments"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_fulfillmentId_sequenceNumber_key" ON "shipments"("fulfillmentId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "shipment_events_shipmentId_idx" ON "shipment_events"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_events_provider_providerEventId_key" ON "shipment_events"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "fulfillments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-added CHECK constraints (mirrors the Handoff 07 migration's own
-- convention of guarding financial/counter integers at the DB level, not
-- only in application code).
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_priceIrr_positive" CHECK ("priceIrr" > 0);
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_sequenceNumber_positive" CHECK ("sequenceNumber" > 0);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sequenceNumber_positive" CHECK ("sequenceNumber" > 0);
