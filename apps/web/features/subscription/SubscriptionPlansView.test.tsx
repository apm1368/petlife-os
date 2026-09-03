import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SubscriptionDto, SubscriptionPlanDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { subscriptionService } from "@/services/subscription.service";
import { SubscriptionPlansView } from "./SubscriptionPlansView";

vi.mock("@/stores/pet-store", () => ({ usePetStore: (selector: (state: { householdId: string }) => unknown) => selector({ householdId: "household-1" }) }));
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { getPlans: vi.fn(), getCurrent: vi.fn(), startTrial: vi.fn(), subscribe: vi.fn(), upgrade: vi.fn(), scheduleDowngrade: vi.fn() },
}));

const FREE_PLAN: SubscriptionPlanDto = {
  id: "plan-free",
  code: "free",
  nameFa: "رایگان",
  nameEn: "Free",
  descriptionFa: null,
  descriptionEn: null,
  status: "ACTIVE" as never,
  sortOrder: 0,
  isFree: true,
  trialDays: null,
  countryAvailability: ["IR"],
  entitlements: [{ key: "pets.max", type: "LIMIT" as never, boolValue: null, limitValue: 2 }],
  prices: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PLUS_PLAN: SubscriptionPlanDto = {
  ...FREE_PLAN,
  id: "plan-plus",
  code: "plus",
  nameFa: "پلاس",
  nameEn: "Plus",
  isFree: false,
  sortOrder: 1,
  trialDays: 14,
  entitlements: [{ key: "pets.max", type: "LIMIT" as never, boolValue: null, limitValue: 5 }],
  prices: [{ id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null }],
};

const FREE_SUB: SubscriptionDto = {
  id: "sub-1",
  status: "ACTIVE" as never,
  plan: { id: "plan-free", code: "free", nameFa: "رایگان", nameEn: "Free" },
  price: null,
  pendingPlan: null,
  pendingPrice: null,
  currentPeriod: null,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  cancelRequestedAt: null,
  cancelEffectiveAt: null,
  expiredAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("SubscriptionPlansView", () => {
  beforeEach(() => {
    vi.mocked(subscriptionService.getPlans).mockReset().mockResolvedValue([FREE_PLAN, PLUS_PLAN]);
    vi.mocked(subscriptionService.getCurrent).mockReset().mockResolvedValue(FREE_SUB);
    vi.mocked(subscriptionService.startTrial).mockReset();
    vi.mocked(subscriptionService.subscribe).mockReset();
    vi.mocked(subscriptionService.upgrade).mockReset();
    vi.mocked(subscriptionService.scheduleDowngrade).mockReset();
  });

  it("shows the FREE plan alongside paid plans — never hidden", async () => {
    renderWithIntl(<SubscriptionPlansView />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy());
    expect(screen.getByText("Plus")).toBeTruthy();
    expect(screen.getByText("Current plan")).toBeTruthy();
  });

  it("offers a trial and a subscribe action for a paid plan when the household is on FREE", async () => {
    renderWithIntl(<SubscriptionPlansView />);
    await waitFor(() => expect(screen.getByText("Plus")).toBeTruthy());

    expect(screen.getByText("Start 14-day trial")).toBeTruthy();
    fireEvent.click(screen.getByText("Subscribe"));

    await waitFor(() => expect(subscriptionService.subscribe).toHaveBeenCalledWith("household-1", { planId: "plan-plus", billingInterval: "MONTHLY" }));
  });

  it("offers upgrade-now and switch-at-renewal for a different paid plan once already on a paid plan", async () => {
    const premiumPlan: SubscriptionPlanDto = { ...PLUS_PLAN, id: "plan-premium", code: "premium", nameEn: "Premium", nameFa: "پرمیوم", sortOrder: 2 };
    vi.mocked(subscriptionService.getPlans).mockResolvedValue([FREE_PLAN, PLUS_PLAN, premiumPlan]);
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue({ ...FREE_SUB, plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" }, price: PLUS_PLAN.prices[0]! });

    renderWithIntl(<SubscriptionPlansView />);
    await waitFor(() => expect(screen.getByText("Premium")).toBeTruthy());

    fireEvent.click(screen.getByText("Upgrade now"));
    await waitFor(() => expect(subscriptionService.upgrade).toHaveBeenCalledWith("household-1", { planId: "plan-premium", billingInterval: "MONTHLY" }));

    // The current paid plan itself offers a downgrade path to Free.
    fireEvent.click(screen.getByText("Downgrade to Free"));
    await waitFor(() => expect(subscriptionService.scheduleDowngrade).toHaveBeenCalledWith("household-1", "plan-free"));
  });
});
