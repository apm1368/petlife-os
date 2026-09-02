import { randomUUID } from "node:crypto";
import type { MarketplaceOperationResult, PublishListingInput, PublishListingResult } from "./marketplace-channel-adapter.interface";

/**
 * Deterministic, no-external-network simulation engine shared by
 * DevMarketplaceAdapter and, for the operations they can honestly simulate,
 * TorobAdapter/DigikalaAdapter (mirrors shipping-simulation.util.ts,
 * Handoff 08) — no official Torob/Digikala docs are available to this
 * project (see README "Provider integration status"), so their sandbox
 * paths run this same generic, clearly-labeled simulation rather than
 * inventing real-looking endpoint/payload shapes. Only opaque ids use
 * randomUUID; there is no other randomness, so tests stay deterministic.
 */
export function simulatePublishListing(input: PublishListingInput, providerPrefix: string): PublishListingResult {
  if (input.mode === "FAILURE") {
    return { status: "REJECTED", failureMessage: "Simulated: listing rejected by provider (missing required attributes)." };
  }
  return { status: "PUBLISHED", externalListingId: `${providerPrefix}-listing-${randomUUID()}` };
}

export function simulateApply(mode: PublishListingInput["mode"]): MarketplaceOperationResult {
  if (mode === "FAILURE") return { status: "FAILED", failureMessage: "Simulated: provider temporarily unavailable." };
  return { status: "APPLIED" };
}
