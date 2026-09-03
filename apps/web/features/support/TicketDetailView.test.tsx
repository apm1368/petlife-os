import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SupportCaseUserDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { supportService } from "@/services/support.service";
import { TicketDetailView } from "./TicketDetailView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/support.service", () => ({
  supportService: { getById: vi.fn(), postMessage: vi.fn(), reopen: vi.fn() },
}));

const CASE: SupportCaseUserDetailDto = {
  id: "case-1",
  caseNumber: "CASE-000001",
  subject: "My order never arrived",
  description: "It has been two weeks",
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
  messages: [{ id: "m1", caseId: "case-1", authorType: "ADMIN" as never, author: { id: "a1", displayName: "Support", role: "SUPPORT" as never }, body: "We're on it.", visibility: "PUBLIC" as never, createdAt: "2026-01-01T00:00:00.000Z" }],
};

describe("TicketDetailView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(supportService.getById).mockReset().mockResolvedValue(CASE);
    vi.mocked(supportService.postMessage).mockReset();
    vi.mocked(supportService.reopen).mockReset();
  });

  it("shows the subject, description, and existing messages — never an internal-notes affordance", async () => {
    renderWithIntl(<TicketDetailView caseId="case-1" />);

    await waitFor(() => expect(screen.getByText("My order never arrived")).toBeTruthy());
    expect(screen.getByText("It has been two weeks")).toBeTruthy();
    expect(screen.getByText("We're on it.")).toBeTruthy();
    expect(screen.queryByText("Internal notes")).toBeNull();
  });

  it("sends a reply", async () => {
    vi.mocked(supportService.postMessage).mockResolvedValue({ id: "m2", caseId: "case-1", authorType: "USER" as never, author: { id: "u1", displayName: "Me" }, body: "Any update?", visibility: "PUBLIC" as never, createdAt: "2026-01-01T00:00:00.000Z" });

    renderWithIntl(<TicketDetailView caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("My order never arrived")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText("Write a message…"), { target: { value: "Any update?" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(supportService.postMessage).toHaveBeenCalledWith("case-1", "Any update?"));
  });

  it("offers to reopen a resolved ticket, but not one still under review", async () => {
    renderWithIntl(<TicketDetailView caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("My order never arrived")).toBeTruthy());
    expect(screen.queryByText("Reopen ticket")).toBeNull();
  });

  it("reopens a resolved ticket", async () => {
    vi.mocked(supportService.getById).mockResolvedValue({ ...CASE, status: "RESOLVED" as never });
    vi.mocked(supportService.reopen).mockResolvedValue({ ...CASE, status: "SUBMITTED" as never });

    renderWithIntl(<TicketDetailView caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("Reopen ticket")).toBeTruthy());

    fireEvent.click(screen.getByText("Reopen ticket"));

    await waitFor(() => expect(supportService.reopen).toHaveBeenCalledWith("case-1"));
  });

  it("hides the reply box once the ticket is closed", async () => {
    vi.mocked(supportService.getById).mockResolvedValue({ ...CASE, status: "CLOSED" as never });

    renderWithIntl(<TicketDetailView caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("My order never arrived")).toBeTruthy());

    expect(screen.queryByPlaceholderText("Write a message…")).toBeNull();
    expect(screen.getByText("Reopen ticket")).toBeTruthy();
  });
});
