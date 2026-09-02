import { Logger } from "@nestjs/common";
import { MarketplaceOrderStatus, MarketplaceProvider } from "@prisma/client";

const logger = new Logger("MarketplaceOrderStatusNormalizer");

/** DEV's own synthetic raw vocabulary — proves real normalization logic runs even in the fully-simulated path (mirrors DEV_STATUS_MAP in shipping-status-normalizer.ts, Handoff 08). */
const DEV_STATUS_MAP: Record<string, MarketplaceOrderStatus> = {
  received: MarketplaceOrderStatus.RECEIVED,
  confirmed: MarketplaceOrderStatus.CONFIRMED,
  processing: MarketplaceOrderStatus.PROCESSING,
  ready_to_fulfill: MarketplaceOrderStatus.READY_TO_FULFILL,
  shipped: MarketplaceOrderStatus.SHIPPED,
  delivered: MarketplaceOrderStatus.DELIVERED,
  cancelled: MarketplaceOrderStatus.CANCELLED,
  returned: MarketplaceOrderStatus.RETURNED,
  failed: MarketplaceOrderStatus.FAILED,
};

/**
 * No official Torob/Digikala order-status vocabulary is available to this
 * project (see README "Provider integration status") — these two maps are
 * illustrative placeholders only, using the same shape as DEV_STATUS_MAP,
 * and must never be presented as confirmed real provider values. A real
 * integration replaces these two maps (and only these two) once official
 * merchant docs are available; the normalization call site never changes.
 */
const TOROB_STATUS_MAP: Record<string, MarketplaceOrderStatus> = { ...DEV_STATUS_MAP };
const DIGIKALA_STATUS_MAP: Record<string, MarketplaceOrderStatus> = { ...DEV_STATUS_MAP };

const MAP_BY_PROVIDER: Record<MarketplaceProvider, Record<string, MarketplaceOrderStatus>> = {
  [MarketplaceProvider.DEV]: DEV_STATUS_MAP,
  [MarketplaceProvider.TOROB]: TOROB_STATUS_MAP,
  [MarketplaceProvider.DIGIKALA]: DIGIKALA_STATUS_MAP,
};

/**
 * Explicit provider order-status normalization (spec section 29) — an
 * unrecognized raw status always maps to UNKNOWN and is logged for
 * reconciliation; it is never interpreted as a real transition and never
 * allowed to regress a terminal local MarketplaceOrder status (enforced by
 * the caller, not here — this function is a pure mapping with no side
 * effects, same discipline as normalizeShippingProviderStatus).
 */
export function normalizeMarketplaceOrderStatus(provider: MarketplaceProvider, rawStatus: string): MarketplaceOrderStatus {
  const canonical = MAP_BY_PROVIDER[provider][rawStatus.toLowerCase()];
  if (!canonical) {
    logger.warn(`Unrecognized ${provider} marketplace order status "${rawStatus}" — mapping to UNKNOWN`);
    return MarketplaceOrderStatus.UNKNOWN;
  }
  return canonical;
}
