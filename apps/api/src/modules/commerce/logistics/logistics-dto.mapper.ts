import type { Fulfillment, Shipment, ShippingQuote } from "@prisma/client";
import type { AddressSnapshotDto, FulfillmentDto, ShipmentDto, ShippingQuoteDto } from "@petlife/types";

/**
 * The exact shape written into `Fulfillment.pickupAddressSnapshot` /
 * `deliveryAddressSnapshot` and `Shipment.pickupAddressSnapshot` /
 * `deliveryAddressSnapshot` (spec section 8) — a plain object matching
 * `AddressSnapshotDto` field-for-field, so writing and reading it back is a
 * single shared shape instead of two independently-drifting ones.
 */
export type AddressSnapshotJson = AddressSnapshotDto;

export function toAddressSnapshotDto(json: unknown): AddressSnapshotDto {
  const snapshot = (json ?? {}) as Partial<AddressSnapshotJson>;
  return {
    recipient: snapshot.recipient ?? null,
    phone: snapshot.phone ?? null,
    addressLine: snapshot.addressLine ?? null,
    city: snapshot.city ?? null,
    region: snapshot.region ?? null,
    countryCode: snapshot.countryCode ?? null,
    instructions: snapshot.instructions ?? null,
    ...(snapshot.area ? { area: snapshot.area } : {}),
    ...(snapshot.postalCode ? { postalCode: snapshot.postalCode } : {}),
    ...(typeof snapshot.latitude === "number" && typeof snapshot.longitude === "number" ? { latitude: snapshot.latitude, longitude: snapshot.longitude } : {}),
  };
}

export function toFulfillmentDto(fulfillment: Fulfillment): FulfillmentDto {
  return {
    id: fulfillment.id,
    orderId: fulfillment.orderId,
    sellerOrganizationId: fulfillment.sellerOrgId,
    status: fulfillment.status as unknown as FulfillmentDto["status"],
    pickupAddress: toAddressSnapshotDto(fulfillment.pickupAddressSnapshot),
    deliveryAddress: toAddressSnapshotDto(fulfillment.deliveryAddressSnapshot),
    readyAt: fulfillment.readyAt?.toISOString() ?? null,
    pickupRequestedAt: fulfillment.pickupRequestedAt?.toISOString() ?? null,
    pickupAssignedAt: fulfillment.pickupAssignedAt?.toISOString() ?? null,
    pickedUpAt: fulfillment.pickedUpAt?.toISOString() ?? null,
    outForDeliveryAt: fulfillment.outForDeliveryAt?.toISOString() ?? null,
    deliveredAt: fulfillment.deliveredAt?.toISOString() ?? null,
    failedAt: fulfillment.failedAt?.toISOString() ?? null,
    canceledAt: fulfillment.canceledAt?.toISOString() ?? null,
    failureCode: fulfillment.failureCode,
    failureReason: fulfillment.failureReason,
    createdAt: fulfillment.createdAt.toISOString(),
    updatedAt: fulfillment.updatedAt.toISOString(),
  };
}

/**
 * What a buyer may see of a fulfillment: the seller's pickup point is reduced to its city/region (it can be someone's
 * home); contact, street, postal code, map point and instructions stay with the seller, staff and the courier.
 */
export function toBuyerFulfillmentDto(fulfillment: Fulfillment): FulfillmentDto {
  const dto = toFulfillmentDto(fulfillment);
  const { city, region, countryCode } = dto.pickupAddress;
  return { ...dto, pickupAddress: { recipient: null, phone: null, addressLine: null, city, region, countryCode, instructions: null } };
}

export function toShipmentDto(shipment: Shipment): ShipmentDto {
  return {
    id: shipment.id,
    fulfillmentId: shipment.fulfillmentId,
    provider: shipment.provider as unknown as ShipmentDto["provider"],
    trackingCode: shipment.trackingCode,
    status: shipment.status as unknown as ShipmentDto["status"],
    estimatedPickupAt: shipment.estimatedPickupAt?.toISOString() ?? null,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt?.toISOString() ?? null,
    actualPickupAt: shipment.actualPickupAt?.toISOString() ?? null,
    actualDeliveryAt: shipment.actualDeliveryAt?.toISOString() ?? null,
    lastReconciledAt: shipment.lastReconciledAt?.toISOString() ?? null,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
  };
}

export function toShippingQuoteDto(quote: ShippingQuote): ShippingQuoteDto {
  return {
    id: quote.id,
    checkoutId: quote.checkoutId,
    sellerOrganizationId: quote.sellerOrgId,
    provider: quote.provider as unknown as ShippingQuoteDto["provider"],
    serviceLevel: quote.serviceLevel,
    priceIrr: quote.priceIrr,
    estimatedPickupMinutes: quote.estimatedPickupMinutes,
    estimatedDeliveryMinutes: quote.estimatedDeliveryMinutes,
    status: quote.status as unknown as ShippingQuoteDto["status"],
    expiresAt: quote.expiresAt.toISOString(),
    createdAt: quote.createdAt.toISOString(),
    pricingBasis: (quote.pricingBasis as ShippingQuoteDto["pricingBasis"]) ?? null,
  };
}
