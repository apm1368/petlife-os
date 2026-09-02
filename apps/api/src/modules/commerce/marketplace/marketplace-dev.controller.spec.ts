import { MarketplaceDevController } from "./marketplace-dev.controller";
import { MarketplaceProviderDisabledException } from "../../../common/errors/api-exception";

/**
 * Spec section 54: "Ensure dev simulator cannot run in production." Tested
 * directly at the guard level (never assumed correct from code review
 * alone) rather than via a live e2e NODE_ENV flip — ConfigService reads
 * process.env once at Nest bootstrap, so an e2e test cannot reliably flip
 * it mid-suite; a unit test with a stubbed ConfigService exercises the
 * exact same `assertDevSimulationAllowed` code path deterministically.
 */
describe("MarketplaceDevController — production gate", () => {
  function buildController(nodeEnv: string, devMarketplaceEnabled = true) {
    const config = { get: (key: string) => (key === "NODE_ENV" ? nodeEnv : devMarketplaceEnabled) };
    // Only the guard is exercised in these tests, so the remaining collaborators are never called.
    return new MarketplaceDevController(config as never, undefined as never, undefined as never, undefined as never, undefined as never);
  }

  it("rejects every simulate endpoint when NODE_ENV is production, regardless of DEV_MARKETPLACE_ENABLED", async () => {
    const controller = buildController("production", true);
    await expect(controller.simulateOrder(undefined as never, "channel-1", { externalOrderId: "x", items: [] })).rejects.toBeInstanceOf(MarketplaceProviderDisabledException);
    await expect(controller.simulateCancellation(undefined as never, "channel-1", { externalOrderId: "x" })).rejects.toBeInstanceOf(MarketplaceProviderDisabledException);
    await expect(controller.simulateMismatch(undefined as never, "channel-1", { externalListingId: "x" })).rejects.toBeInstanceOf(MarketplaceProviderDisabledException);
    await expect(controller.simulatePublishRejection(undefined as never, "channel-1", { listingId: "x" })).rejects.toBeInstanceOf(MarketplaceProviderDisabledException);
  });

  it("rejects when DEV_MARKETPLACE_ENABLED is false even outside production", async () => {
    const controller = buildController("development", false);
    await expect(controller.simulateOrder(undefined as never, "channel-1", { externalOrderId: "x", items: [] })).rejects.toBeInstanceOf(MarketplaceProviderDisabledException);
  });
});
