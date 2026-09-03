import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminSubscriptionDetailDto, SubscriptionEntitlementOverrideDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminSubscriptionService } from "@/services/admin-subscription.service";
import { AdminSubscriptionHouseholdDetailView } from "./AdminSubscriptionHouseholdDetailView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/admin-subscription.service", () => ({
  adminSubscriptionService: {
    getHouseholdSubscription: vi.fn(),
    listOverrides: vi.fn(),
    cancelHouseholdSubscription: vi.fn(),
    refundBillingAttempt: vi.fn(),
    grantOverride: vi.fn(),
    revokeOverride: vi.fn(),
  },
}));

const DETAIL: AdminSubscriptionDetailDto = {
  id: "sub-1",
  status: "ACTIVE" as never,
  plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" },
  price: { id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null },
  pendingPlan: null,
  pendingPrice: null,
  currentPeriod: { id: "period-1", status: "ACTIVE" as never, plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" }, startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-02-01T00:00:00.000Z", isTrial: false, amount: 500_000, currency: "IRR" },
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  cancelRequestedAt: null,
  cancelEffectiveAt: null,
  expiredAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  household: { id: "household-1", name: "Rahimi Family" },
  changes: [],
  billingAttempts: [
    { id: "attempt-1", reason: "INITIAL" as never, attemptNumber: 1, status: "SUCCEEDED" as never, amount: 500_000, currency: "IRR", failureCode: null, failureReason: null, paymentIntentId: "intent-1", createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:01:00.000Z" },
  ],
};

const OVERRIDE: SubscriptionEntitlementOverrideDto = {
  id: "override-1",
  householdId: "household-1",
  key: "pets.max",
  type: "LIMIT" as never,
  boolValue: null,
  limitValue: 999,
  reason: "Goodwill gesture",
  createdByAdmin: { id: "admin-1", displayName: "Admin One", role: "SUPER_ADMIN" as never },
  expiresAt: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("AdminSubscriptionHouseholdDetailView", () => {
  beforeEach(() => {
    vi.mocked(adminSubscriptionService.getHouseholdSubscription).mockReset().mockResolvedValue(DETAIL);
    vi.mocked(adminSubscriptionService.listOverrides).mockReset().mockResolvedValue([]);
    vi.mocked(adminSubscriptionService.cancelHouseholdSubscription).mockReset();
    vi.mocked(adminSubscriptionService.refundBillingAttempt).mockReset();
    vi.mocked(adminSubscriptionService.grantOverride).mockReset();
    vi.mocked(adminSubscriptionService.revokeOverride).mockReset();
  });

  it("shows the household's plan, status, and billing attempts", async () => {
    renderWithIntl(<AdminSubscriptionHouseholdDetailView householdId="household-1" />);

    await waitFor(() => expect(screen.getByText("Rahimi Family")).toBeTruthy());
    expect(screen.getByText("Plus")).toBeTruthy();
    expect(screen.getByText(/INITIAL/)).toBeTruthy();
  });

  it("cancels the household's subscription with a reason", async () => {
    vi.mocked(adminSubscriptionService.cancelHouseholdSubscription).mockResolvedValue({ ...DETAIL, status: "CANCEL_AT_PERIOD_END" as never });

    renderWithIntl(<AdminSubscriptionHouseholdDetailView householdId="household-1" />);
    await waitFor(() => expect(screen.getByText("Rahimi Family")).toBeTruthy());

    fireEvent.change(screen.getAllByLabelText("Reason")[0]!, { target: { value: "Fraud investigation" } });
    fireEvent.click(screen.getByText("Cancel subscription"));

    await waitFor(() => expect(adminSubscriptionService.cancelHouseholdSubscription).toHaveBeenCalledWith("household-1", "Fraud investigation"));
  });

  it("refunds a succeeded billing attempt", async () => {
    renderWithIntl(<AdminSubscriptionHouseholdDetailView householdId="household-1" />);
    await waitFor(() => expect(screen.getByText("Rahimi Family")).toBeTruthy());

    fireEvent.change(screen.getAllByLabelText("Reason")[1]!, { target: { value: "Customer requested a refund" } });
    fireEvent.click(screen.getByText("Refund"));

    await waitFor(() => expect(adminSubscriptionService.refundBillingAttempt).toHaveBeenCalledWith("attempt-1", "Customer requested a refund"));
  });

  it("grants and revokes an entitlement override", async () => {
    vi.mocked(adminSubscriptionService.grantOverride).mockResolvedValue(OVERRIDE);
    // The component reloads the overrides list right after a successful grant — anticipate that reload here.
    vi.mocked(adminSubscriptionService.listOverrides).mockResolvedValue([OVERRIDE]);

    renderWithIntl(<AdminSubscriptionHouseholdDetailView householdId="household-1" />);
    await waitFor(() => expect(screen.getByText("Rahimi Family")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Limit value"), { target: { value: "999" } });
    fireEvent.change(screen.getAllByLabelText("Reason")[2]!, { target: { value: "Goodwill gesture" } });
    fireEvent.click(screen.getByText("Grant override"));

    await waitFor(() =>
      expect(adminSubscriptionService.grantOverride).toHaveBeenCalledWith(
        expect.objectContaining({ householdId: "household-1", key: "pets.max", type: "LIMIT", limitValue: 999, reason: "Goodwill gesture" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("Revoke")).toBeTruthy());

    fireEvent.click(screen.getByText("Revoke"));
    await waitFor(() => expect(adminSubscriptionService.revokeOverride).toHaveBeenCalledWith("override-1"));
  });
});
