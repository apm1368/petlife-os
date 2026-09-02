import { Logger } from "@nestjs/common";
import { ShipmentStatus, ShippingProvider } from "@prisma/client";

const logger = new Logger("ShippingStatusNormalizer");

/**
 * DEV's own synthetic raw vocabulary (lowercase snake_case, deliberately
 * distinct from the canonical PascalCase enum) — proves real
 * normalization logic runs even in the fully-simulated path, rather than a
 * same-string passthrough.
 */
const DEV_STATUS_MAP: Record<string, ShipmentStatus> = {
  created: ShipmentStatus.CREATED,
  requested: ShipmentStatus.REQUESTED,
  assigned: ShipmentStatus.ASSIGNED,
  picked_up: ShipmentStatus.PICKED_UP,
  in_transit: ShipmentStatus.IN_TRANSIT,
  out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
  delivered: ShipmentStatus.DELIVERED,
  failed: ShipmentStatus.FAILED,
  canceled: ShipmentStatus.CANCELED,
};

/**
 * No official AloPeyk/SnappBox status vocabulary is available to this
 * project (see README "Provider integration status") — these two maps are
 * illustrative placeholders only, using the same shape as DEV_STATUS_MAP,
 * and must never be presented as confirmed real provider values. A real
 * integration replaces these two maps (and only these two) once official
 * docs are available; the normalization call site never changes.
 */
const ALOPEYK_STATUS_MAP: Record<string, ShipmentStatus> = { ...DEV_STATUS_MAP };
const SNAPPBOX_STATUS_MAP: Record<string, ShipmentStatus> = { ...DEV_STATUS_MAP };

const MAP_BY_PROVIDER: Record<ShippingProvider, Record<string, ShipmentStatus>> = {
  [ShippingProvider.DEV]: DEV_STATUS_MAP,
  [ShippingProvider.ALOPEYK]: ALOPEYK_STATUS_MAP,
  [ShippingProvider.SNAPPBOX]: SNAPPBOX_STATUS_MAP,
};

/**
 * Explicit provider status normalization (spec section 16) — an
 * unrecognized raw status always maps to UNKNOWN and is logged for
 * diagnosis; it is never interpreted as success and never allowed to
 * regress a terminal local Shipment status (enforced by the caller, not
 * here — this function is a pure mapping with no side effects).
 */
export function normalizeShippingProviderStatus(provider: ShippingProvider, rawStatus: string): ShipmentStatus {
  const canonical = MAP_BY_PROVIDER[provider][rawStatus.toLowerCase()];
  if (!canonical) {
    logger.warn(`Unrecognized ${provider} shipping status "${rawStatus}" — mapping to UNKNOWN`);
    return ShipmentStatus.UNKNOWN;
  }
  return canonical;
}
