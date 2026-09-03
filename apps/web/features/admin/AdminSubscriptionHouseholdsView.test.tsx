import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminSubscriptionSummaryDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminSubscriptionService } from "@/services/admin-subscription.service";
import { AdminSubscriptionHouseholdsView } from "./AdminSubscriptionHouseholdsView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin-subscription.service", () => ({
  adminSubscriptionService: { listHouseholdSubscriptions: vi.fn() },
}));

const ROW: AdminSubscriptionSummaryDto = {
  id: "sub-1",
  household: { id: "household-1", name: "Rahimi Family" },
  status: "ACTIVE" as never,
  plan: { id: "plan-plus", code: "plus", nameFa: "پلاس", nameEn: "Plus" },
  currentPeriodEndAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function page(items: AdminSubscriptionSummaryDto[]): PaginatedDto<AdminSubscriptionSummaryDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("AdminSubscriptionHouseholdsView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminSubscriptionService.listHouseholdSubscriptions).mockReset();
  });

  it("shows an empty state when there are no household subscriptions", async () => {
    vi.mocked(adminSubscriptionService.listHouseholdSubscriptions).mockResolvedValue(page([]));

    renderWithIntl(<AdminSubscriptionHouseholdsView />);

    await waitFor(() => expect(screen.getByText("Nothing here yet.")).toBeTruthy());
  });

  it("lists a household subscription and navigates to its detail page on click", async () => {
    vi.mocked(adminSubscriptionService.listHouseholdSubscriptions).mockResolvedValue(page([ROW]));

    renderWithIntl(<AdminSubscriptionHouseholdsView />);
    await waitFor(() => expect(screen.getByText("Rahimi Family")).toBeTruthy());

    fireEvent.click(screen.getByText("Rahimi Family"));
    expect(push).toHaveBeenCalledWith("/en/admin/subscriptions/households/household-1");
  });

  it("refetches with the selected status filter", async () => {
    vi.mocked(adminSubscriptionService.listHouseholdSubscriptions).mockResolvedValue(page([ROW]));

    renderWithIntl(<AdminSubscriptionHouseholdsView />);
    await waitFor(() => expect(screen.getByText("Rahimi Family")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "PAST_DUE" } });

    await waitFor(() => expect(adminSubscriptionService.listHouseholdSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ status: "PAST_DUE" })));
  });
});
