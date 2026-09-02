import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, SupportCaseSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminSupportQueueView } from "./AdminSupportQueueView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({
  adminService: { listSupportCases: vi.fn(), createSupportCase: vi.fn() },
}));

const CASE: SupportCaseSummaryDto = {
  id: "case-1",
  caseNumber: "CASE-000001",
  requesterUserId: "user-1",
  requesterDisplayName: "Jane Doe",
  householdId: null,
  petId: null,
  subject: "Cannot book a vet",
  category: "BOOKING" as never,
  priority: "NORMAL" as never,
  status: "OPEN" as never,
  assignedAdmin: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  closedAt: null,
};

function page(items: SupportCaseSummaryDto[]): PaginatedDto<SupportCaseSummaryDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("AdminSupportQueueView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminService.listSupportCases).mockReset();
    vi.mocked(adminService.createSupportCase).mockReset();
  });

  it("lists support cases and navigates to the detail page on click", async () => {
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([CASE]));

    renderWithIntl(<AdminSupportQueueView />);

    await waitFor(() => expect(screen.getByText("CASE-000001")).toBeTruthy());
    fireEvent.click(screen.getByText("CASE-000001"));
    expect(push).toHaveBeenCalledWith("/en/admin/support/case-1");
  });

  it("shows an empty state when there are no cases", async () => {
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([]));

    renderWithIntl(<AdminSupportQueueView />);

    await waitFor(() => expect(screen.getByText("Nothing here yet.")).toBeTruthy());
  });

  it("creates a new support case and navigates to it", async () => {
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([]));
    vi.mocked(adminService.createSupportCase).mockResolvedValue({ ...CASE, id: "case-2", caseNumber: "CASE-000002" });

    renderWithIntl(<AdminSupportQueueView />);
    await waitFor(() => expect(screen.getByText("Nothing here yet.")).toBeTruthy());

    fireEvent.click(screen.getByText("New case"));
    fireEvent.change(screen.getByLabelText("Requester user ID"), { target: { value: "user-9" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Billing question" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Overcharged" } });
    fireEvent.click(screen.getByText("Create case"));

    await waitFor(() => expect(adminService.createSupportCase).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/en/admin/support/case-2");
  });
});
