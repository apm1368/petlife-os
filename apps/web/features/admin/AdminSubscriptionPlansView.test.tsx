import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SubscriptionPlanDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminSubscriptionService } from "@/services/admin-subscription.service";
import { AdminSubscriptionPlansView } from "./AdminSubscriptionPlansView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin-subscription.service", () => ({
  adminSubscriptionService: { listPlans: vi.fn(), createPlan: vi.fn(), createPrice: vi.fn() },
}));

const PLAN: SubscriptionPlanDto = {
  id: "plan-plus",
  code: "plus",
  nameFa: "پلاس",
  nameEn: "Plus",
  descriptionFa: null,
  descriptionEn: null,
  status: "ACTIVE" as never,
  sortOrder: 1,
  isFree: false,
  trialDays: 14,
  countryAvailability: ["IR"],
  entitlements: [],
  prices: [{ id: "price-1", countryCode: "IR", currency: "IRR", billingInterval: "MONTHLY" as never, amount: 500_000, status: "ACTIVE" as never, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AdminSubscriptionPlansView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminSubscriptionService.listPlans).mockReset().mockResolvedValue([PLAN]);
    vi.mocked(adminSubscriptionService.createPlan).mockReset();
    vi.mocked(adminSubscriptionService.createPrice).mockReset();
  });

  it("lists existing plans with their prices", async () => {
    renderWithIntl(<AdminSubscriptionPlansView />);

    await waitFor(() => expect(screen.getByText(/Plus/)).toBeTruthy());
    expect(screen.getByText(/50,000 Toman/)).toBeTruthy();
  });

  it("creates a new plan from the form", async () => {
    vi.mocked(adminSubscriptionService.createPlan).mockResolvedValue({ ...PLAN, id: "plan-new", code: "new-plan" });

    renderWithIntl(<AdminSubscriptionPlansView />);
    await waitFor(() => expect(screen.getByText(/Plus/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "new-plan" } });
    fireEvent.change(screen.getByLabelText("Name (Persian)"), { target: { value: "جدید" } });
    fireEvent.change(screen.getByLabelText("Name (English)"), { target: { value: "New Plan" } });
    fireEvent.click(screen.getByText("Create plan"));

    await waitFor(() =>
      expect(adminSubscriptionService.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({ code: "new-plan", nameFa: "جدید", nameEn: "New Plan", countryAvailability: ["IR"] }),
      ),
    );
  });

  it("adds a new monthly price to an existing plan", async () => {
    vi.mocked(adminSubscriptionService.createPrice).mockResolvedValue({ ...PLAN.prices[0]!, id: "price-2", amount: 600_000 });

    renderWithIntl(<AdminSubscriptionPlansView />);
    await waitFor(() => expect(screen.getByText(/Plus/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("New monthly price (IRR)"), { target: { value: "600000" } });
    fireEvent.click(screen.getByText("Add price"));

    await waitFor(() => expect(adminSubscriptionService.createPrice).toHaveBeenCalledWith("plan-plus", { countryCode: "IR", billingInterval: "MONTHLY", amount: 600000 }));
  });
});
