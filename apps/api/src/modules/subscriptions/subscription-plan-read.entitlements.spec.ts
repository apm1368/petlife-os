import { SubscriptionEntitlementType } from "@prisma/client";
import { DEFAULT_FREE_PLAN_ENTITLEMENTS } from "./subscription-plan-read.service";
import { UsageService } from "./usage.service";

/**
 * Guards the one asymmetry that silently disables a whole feature rather
 * than failing loudly: `EntitlementService.getLimit` resolves an unknown
 * LIMIT key to `0`, not "unmetered". So any metered key missing from the
 * self-healing default FREE plan makes `assertWithinLimit` reject the very
 * first create for that resource in any environment that has not run
 * `seed.ts` — which is every fresh dev checkout and the CI e2e database
 * (`prisma migrate deploy` only, never `db seed`).
 *
 * A pure unit test on purpose: adding a metered resource in
 * `UsageService.DERIVERS` and forgetting its default limit must break here,
 * at `pnpm test`, rather than in whichever e2e flow happens to create that
 * resource first.
 */
describe("default FREE plan entitlements", () => {
  it("defines a limit for every metered usage key", () => {
    const defined = new Set(DEFAULT_FREE_PLAN_ENTITLEMENTS.map((e) => e.key));
    const missing = UsageService.meteredKeys().filter((key) => !defined.has(key));
    expect(missing).toEqual([]);
  });

  it("declares every entry as a LIMIT, since every metered key is a quota", () => {
    for (const entitlement of DEFAULT_FREE_PLAN_ENTITLEMENTS) {
      expect(entitlement.type).toBe(SubscriptionEntitlementType.LIMIT);
    }
  });

  it("never defaults a metered key to a zero limit, which would block the feature outright", () => {
    const metered = new Set(UsageService.meteredKeys());
    for (const entitlement of DEFAULT_FREE_PLAN_ENTITLEMENTS.filter((e) => metered.has(e.key))) {
      // `null` is legitimate (unlimited); `0` is never a usable default.
      expect(entitlement.limitValue === null || entitlement.limitValue > 0).toBe(true);
    }
  });

  it("keys are unique, so no entry can shadow another's limit", () => {
    const keys = DEFAULT_FREE_PLAN_ENTITLEMENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
