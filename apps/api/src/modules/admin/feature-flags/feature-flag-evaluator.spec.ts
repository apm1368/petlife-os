import { evaluateFeatureFlag } from "./feature-flag-evaluator";

const flag = { isEnabled: true, rolloutPercentage: 0, cities: [], betaUserIds: [] };

describe("evaluateFeatureFlag", () => {
  it("never exposes a disabled flag", () => {
    expect(
      evaluateFeatureFlag(
        "checkout-v2",
        { ...flag, isEnabled: false, rolloutPercentage: 100 },
        { userId: "user-a" },
      ),
    ).toEqual({ enabled: false, reason: "DISABLED" });
  });

  it("honours the beta allow-list and city targeting before percentage rollout", () => {
    expect(
      evaluateFeatureFlag("checkout-v2", { ...flag, betaUserIds: ["user-a"] }, { userId: "user-a" }),
    ).toEqual({ enabled: true, reason: "BETA_USER" });
    expect(evaluateFeatureFlag("checkout-v2", { ...flag, cities: ["Tehran"] }, { city: "tehran" })).toEqual({
      enabled: true,
      reason: "CITY",
    });
  });

  it("uses a deterministic percentage decision and requires an identity", () => {
    const gradual = { ...flag, rolloutPercentage: 35 };
    expect(evaluateFeatureFlag("checkout-v2", gradual, { userId: "user-a" })).toEqual(
      evaluateFeatureFlag("checkout-v2", gradual, { userId: "user-a" }),
    );
    expect(evaluateFeatureFlag("checkout-v2", gradual)).toEqual({ enabled: false, reason: "NOT_TARGETED" });
    expect(
      evaluateFeatureFlag("checkout-v2", { ...flag, rolloutPercentage: 100 }, { userId: "user-a" }),
    ).toEqual({ enabled: true, reason: "ROLLOUT" });
  });
});
