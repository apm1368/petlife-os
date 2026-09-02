import { ShippingProvider } from "@prisma/client";
import type { ShippingProviderCapabilities } from "./shipping-gateway.interface";

/**
 * The canonical shipping-provider capability registry (spec section 11) —
 * mirrors payment-provider-registry.ts's PROVIDER_CAPABILITIES exactly.
 * Every capability check in orchestration code reads from this map, never
 * from a `provider === "ALOPEYK"` branch. All three providers currently
 * declare the same full capability set because every one of them (DEV
 * included) is backed by the same deterministic simulation engine this
 * phase — see README "Provider integration status" for what is real vs.
 * simulated for ALOPEYK/SNAPPBOX specifically.
 */
export const SHIPPING_PROVIDER_CAPABILITIES: Record<ShippingProvider, ShippingProviderCapabilities> = {
  DEV: {
    supportsQuote: true,
    supportsCancel: true,
    supportsWebhook: true,
    supportsStatusQuery: true,
    supportsTracking: true,
  },
  ALOPEYK: {
    supportsQuote: true,
    supportsCancel: true,
    supportsWebhook: true,
    supportsStatusQuery: true,
    supportsTracking: true,
  },
  SNAPPBOX: {
    supportsQuote: true,
    supportsCancel: true,
    supportsWebhook: true,
    supportsStatusQuery: true,
    supportsTracking: true,
  },
};
