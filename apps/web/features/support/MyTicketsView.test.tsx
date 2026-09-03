import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SupportCaseUserSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { supportService } from "@/services/support.service";
import { MyTicketsView } from "./MyTicketsView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/support.service", () => ({ supportService: { list: vi.fn() } }));

const TICKET: SupportCaseUserSummaryDto = {
  id: "case-1",
  caseNumber: "CASE-000001",
  subject: "My order never arrived",
  category: "ORDER" as never,
  status: "UNDER_REVIEW" as never,
  householdId: null,
  petId: null,
  relatedEntityType: null,
  relatedEntityId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  closedAt: null,
};

describe("MyTicketsView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(supportService.list).mockReset();
  });

  it("shows each ticket's case number, subject, and simplified status", async () => {
    vi.mocked(supportService.list).mockResolvedValue({ items: [TICKET], total: 1, page: 1, pageSize: 50 });

    renderWithIntl(<MyTicketsView />);

    await waitFor(() => expect(screen.getByText("CASE-000001")).toBeTruthy());
    expect(screen.getByText("My order never arrived")).toBeTruthy();
    expect(screen.getByText("Under review")).toBeTruthy();
  });

  it("shows an empty state with no tickets yet", async () => {
    vi.mocked(supportService.list).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });

    renderWithIntl(<MyTicketsView />);

    await waitFor(() => expect(screen.getByText("You have no support tickets yet.")).toBeTruthy());
  });

  it("navigates to the ticket detail page when a ticket is clicked", async () => {
    vi.mocked(supportService.list).mockResolvedValue({ items: [TICKET], total: 1, page: 1, pageSize: 50 });

    renderWithIntl(<MyTicketsView />);

    await waitFor(() => expect(screen.getByText("CASE-000001")).toBeTruthy());
    screen.getByText("CASE-000001").closest("button")?.click();

    expect(push).toHaveBeenCalledWith("/en/support/tickets/case-1");
  });
});
