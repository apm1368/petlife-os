import { MessagingProvider } from "@prisma/client";
import type { MessagingProviderCapabilities } from "./messaging-gateway.interface";

/**
 * The canonical messaging-provider capability registry — mirrors
 * SHIPPING_PROVIDER_CAPABILITIES/MARKETPLACE_PROVIDER_CAPABILITIES exactly.
 * DEV declares full capabilities (it is genuinely simulated end to end,
 * including a fabricated-but-labeled DELIVERED confirmation for test
 * determinism). FARAZ declares `supportsDeliveryStatus: false` and
 * `supportsWebhook: false` — not because Faraz definitely lacks these, but
 * because no official documentation confirming either was available to
 * this project (see FarazSmsAdapter's own doc comment); the honest default
 * is "unconfirmed capability is treated as absent", never assumed present.
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
