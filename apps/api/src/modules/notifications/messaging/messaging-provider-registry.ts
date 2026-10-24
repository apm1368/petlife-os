import { MessagingProvider } from "@prisma/client";
import type { MessagingProviderCapabilities } from "./messaging-gateway.interface";

/**
 * The canonical messaging-provider capability registry — mirrors
 * SHIPPING_PROVIDER_CAPABILITIES/MARKETPLACE_PROVIDER_CAPABILITIES exactly.
 * DEV declares full simulated capabilities. Faraz's Pattern API returns a
 * send-request id, but this application does not poll the documented items
 * endpoint yet, so SENT (accepted/queued) remains the honest ceiling.
 */
export const MESSAGING_PROVIDER_CAPABILITIES: Record<MessagingProvider, MessagingProviderCapabilities> = {
  DEV: {
    supportsDeliveryStatus: true,
    supportsWebhook: true,
    supportsStatusQuery: true,
    supportsUnicode: true,
  },
  FARAZ: {
    supportsDeliveryStatus: false,
    supportsWebhook: false,
    supportsStatusQuery: false,
    supportsUnicode: true,
  },
};
