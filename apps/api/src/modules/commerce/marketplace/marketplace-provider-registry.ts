import { MarketplaceProvider } from "@prisma/client";
import type { MarketplaceProviderCapabilities } from "./marketplace-channel-adapter.interface";

/**
 * The canonical marketplace-provider capability registry (spec section 22)
 * — mirrors SHIPPING_PROVIDER_CAPABILITIES (Handoff 08) exactly. Every
 * capability check in orchestration code reads from this map, never from a
 * `provider === "TOROB"` branch (spec: "never pretend a provider supports
 * something unless confirmed"). DEV declares full capabilities since it is
 * a fully functional simulation used for tests; TOROB/DIGIKALA declare only
 * what this project could confirm from documentation available to it (see
 * README "Provider integration status" — order pull/ack/cancel and listing
 * publish/price/inventory push are the operations a seller-merchant API
 * would minimally need to support commerce sync, which is why the
 * *architecture* below assumes them; the *adapters* themselves are
 * explicit about what is actually implemented vs. NOT IMPLEMENTED pending
 * credentials/docs).
 */
export const MARKETPLACE_PROVIDER_CAPABILITIES: Record<MarketplaceProvider, MarketplaceProviderCapabilities> = {
  DEV: {
    supportsListingPublish: true,
    supportsInventoryPush: true,
    supportsPricePush: true,
    supportsOrderPull: true,
    supportsWebhooks: true,
    supportsOrderCancellation: true,
    supportsListingPause: true,
    supportsReconciliation: true,
    supportsVariantMapping: true,
  },
  TOROB: {
    supportsListingPublish: true,
    supportsInventoryPush: true,
    supportsPricePush: true,
    supportsOrderPull: false,
    supportsWebhooks: false,
    supportsOrderCancellation: false,
    supportsListingPause: true,
    supportsReconciliation: true,
    supportsVariantMapping: true,
  },
  DIGIKALA: {
    supportsListingPublish: true,
    supportsInventoryPush: true,
    supportsPricePush: true,
    supportsOrderPull: true,
    supportsWebhooks: false,
    supportsOrderCancellation: true,
    supportsListingPause: true,
    supportsReconciliation: true,
    supportsVariantMapping: true,
  },
};
