import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ResolvedEntitlementDto, SubscriptionDto, SubscriptionUsageItemDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { subscriptionService } from "@/services/subscription.service";
import { ApiError } from "@/lib/api/client";
import { SubscriptionOverviewView } from "./SubscriptionOverviewView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/pet-store", () => ({ usePetStore: (selector: (state: { householdId: string }) => unknown) => selector({ householdId: "household-1" }) }));
vi.mock("@/services/subscription.service", () => ({
  subscriptionService: { getCurrent: vi.fn(), getEntitlements: vi.fn(), getUsage: vi.fn(), cancel: vi.fn(), resume: vi.fn() },
}));

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

const ENTITLEMENTS: ResolvedEntitlementDto[] = [{ key: "pets.max", type: "LIMIT" as never, boolValue: null, limitValue: 2, overridden: false }];
const USAGE: SubscriptionUsageItemDto[] = [{ key: "pets.max", limit: 2, used: 1, remaining: 1 }];

describe("SubscriptionOverviewView", () => {
  beforeEach(() => {
    vi.mocked(subscriptionService.getCurrent).mockReset();
    vi.mocked(subscriptionService.getEntitlements).mockReset().mockResolvedValue(ENTITLEMENTS);
    vi.mocked(subscriptionService.getUsage).mockReset().mockResolvedValue(USAGE);
    vi.mocked(subscriptionService.cancel).mockReset();
    vi.mocked(subscriptionService.resume).mockReset();
  });

  it("shows the FREE plan, its status, and usage without ever hiding that it is free", async () => {
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(FREE_SUB);

    renderWithIntl(<SubscriptionOverviewView />);

    await waitFor(() => expect(screen.getByText("Free")).toBeTruthy());
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    // A household on FREE has no paid period, so there is nothing to cancel.
    expect(screen.queryByText("Cancel subscription")).toBeNull();
  });

  it("shows a cancel button for a paid plan and calls the cancel endpoint", async () => {
    const paidSub: SubscriptionDto = {
      ...FREE_SUB,
      plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" },
      price: { id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null },
      currentPeriod: { id: "period-1", status: "ACTIVE" as never, plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" }, startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-02-01T00:00:00.000Z", isTrial: false, amount: 500_000, currency: "IRR" },
    };
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(paidSub);
    vi.mocked(subscriptionService.cancel).mockResolvedValue({ ...paidSub, status: "CANCEL_AT_PERIOD_END" as never, cancelEffectiveAt: "2026-02-01T00:00:00.000Z" });

    renderWithIntl(<SubscriptionOverviewView />);

    await waitFor(() => expect(screen.getByText("Plus")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel subscription"));

    await waitFor(() => expect(subscriptionService.cancel).toHaveBeenCalledWith("household-1"));
    await waitFor(() => expect(screen.getByText("Resume subscription")).toBeTruthy());
  });

  it("surfaces the backend's own specific error message when an action fails, never a generic one", async () => {
    const paidSub: SubscriptionDto = { ...FREE_SUB, price: { id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null } };
    vi.mocked(subscriptionService.getCurrent).mockResolvedValue(paidSub);
    vi.mocked(subscriptionService.cancel).mockRejectedValue(new ApiError({ code: "INVALID_SUBSCRIPTION_STATUS_TRANSITION", message: "This subscription status transition is not allowed.", requestId: "req-1" }, 409));

    renderWithIntl(<SubscriptionOverviewView />);
    await waitFor(() => expect(screen.getByText("Cancel subscription")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel subscription"));

    await waitFor(() => expect(screen.getByText("This subscription status transition is not allowed.")).toBeTruthy());
  });
});
