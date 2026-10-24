import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

describe("subscription pagination and filter isolation", () => {
  beforeEach(() => vi.mocked(adminSubscriptionService.listHouseholdSubscriptions).mockReset());

  it("reads the next API page and resets pagination when the status changes", async () => {
    vi.mocked(adminSubscriptionService.listHouseholdSubscriptions).mockImplementation(async ({ page: current = 1 } = {}) => ({ ...page([ROW]), total: 51, page: current }));
    renderWithIntl(<AdminSubscriptionHouseholdsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(adminSubscriptionService.listHouseholdSubscriptions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    await waitFor(() => expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ACTIVE" } });
    await waitFor(() => expect(adminSubscriptionService.listHouseholdSubscriptions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: "ACTIVE" })));
  });

  it("ignores an older response arriving after the selected filter", async () => {
    let resolveOld!: (value: PaginatedDto<AdminSubscriptionSummaryDto>) => void;
    vi.mocked(adminSubscriptionService.listHouseholdSubscriptions)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(page([{ ...ROW, household: { id: "new", name: "Filtered household" } }]));
    renderWithIntl(<AdminSubscriptionHouseholdsView />);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ACTIVE" } });
    await screen.findByText("Filtered household");
    await act(async () => { resolveOld(page([ROW])); });
    await waitFor(() => expect(screen.queryByText("Rahimi Family")).toBeNull());
    expect(screen.getByText("Filtered household")).toBeTruthy();
  });

  it("hides stale rows after a failed filter request and retries the same filter", async () => {
    vi.mocked(adminSubscriptionService.listHouseholdSubscriptions).mockResolvedValueOnce(page([ROW])).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([]));
    renderWithIntl(<AdminSubscriptionHouseholdsView />);
    await screen.findByText("Rahimi Family");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "EXPIRED" } });
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByText("Nothing here yet.");
    expect(screen.queryByText("Rahimi Family")).toBeNull();
    expect(adminSubscriptionService.listHouseholdSubscriptions).toHaveBeenLastCalledWith({ status: "EXPIRED", page: 1, pageSize: 50 });
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("EXPIRED");
  });
});
