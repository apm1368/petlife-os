import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SupportCaseDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminSupportCaseDetailView } from "./AdminSupportCaseDetailView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({
  adminService: {
    getSupportCase: vi.fn(),
    getSupportCaseContext: vi.fn(),
    assignSupportCase: vi.fn(),
    transitionSupportCase: vi.fn(),
    postSupportMessage: vi.fn(),
    addSupportNote: vi.fn(),
  },
}));

const CASE: SupportCaseDetailDto = {
  id: "case-1",
  caseNumber: "CASE-000001",
  requesterUserId: "user-1",
  requesterDisplayName: "Jane Doe",
  householdId: null,
  petId: null,
  subject: "Cannot book a vet",
  description: "Booking keeps failing",
  category: "BOOKING" as never,
  priority: "NORMAL" as never,
  status: "OPEN" as never,
  assignedAdmin: null,
  createdByAdmin: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  closedAt: null,
  relatedEntityType: null,
  relatedEntityId: null,
  messages: [{ id: "m1", caseId: "case-1", authorType: "USER" as never, author: { id: "user-1", displayName: "Jane Doe" }, body: "Please help", visibility: "PUBLIC" as never, createdAt: "2026-01-01T00:00:00.000Z" }],
  internalNotes: [],
};

describe("AdminSupportCaseDetailView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminService.getSupportCase).mockReset().mockResolvedValue(CASE);
    vi.mocked(adminService.getSupportCaseContext)
      .mockReset()
      .mockResolvedValue({ household: null, pet: null, relatedEntity: null, previousCases: [], firstResponseAt: null, firstResponseTimeMinutes: null, resolutionTimeMinutes: null, subscription: null });
    vi.mocked(adminService.assignSupportCase).mockReset();
    vi.mocked(adminService.transitionSupportCase).mockReset();
    vi.mocked(adminService.postSupportMessage).mockReset();
    vi.mocked(adminService.addSupportNote).mockReset();
  });

  it("shows the case subject, requester, and existing public message", async () => {
    renderWithIntl(<AdminSupportCaseDetailView caseId="case-1" />);

    await waitFor(() => expect(screen.getByText("Cannot book a vet")).toBeTruthy());
    expect(screen.getByText("Requester: Jane Doe")).toBeTruthy();
    expect(screen.getByText("Please help")).toBeTruthy();
  });

  it("assigns the case to another admin", async () => {
    vi.mocked(adminService.assignSupportCase).mockResolvedValue({ ...CASE, assignedAdmin: { id: "admin-2", displayName: "Bob", role: "SUPPORT" as never } });

    renderWithIntl(<AdminSupportCaseDetailView caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("Cannot book a vet")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Assign to admin"), { target: { value: "admin-2" } });
    fireEvent.click(screen.getByText("Assign"));

    await waitFor(() => expect(adminService.assignSupportCase).toHaveBeenCalledWith("case-1", "admin-2"));
  });

  it("posts a public reply", async () => {
    vi.mocked(adminService.postSupportMessage).mockResolvedValue({ id: "m2", caseId: "case-1", authorType: "ADMIN" as never, author: { id: "a1", displayName: "Admin", role: "SUPPORT" as never }, body: "We are on it", visibility: "PUBLIC" as never, createdAt: "2026-01-01T00:00:00.000Z" });

    renderWithIntl(<AdminSupportCaseDetailView caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("Cannot book a vet")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Write a reply…"), { target: { value: "We are on it" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(adminService.postSupportMessage).toHaveBeenCalledWith("case-1", "We are on it", "PUBLIC"));
  });

  it("transitions the case status", async () => {
    vi.mocked(adminService.transitionSupportCase).mockResolvedValue({ ...CASE, status: "IN_PROGRESS" as never });

    renderWithIntl(<AdminSupportCaseDetailView caseId="case-1" />);
    await waitFor(() => expect(screen.getByText("Cannot book a vet")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "In progress" }));

    await waitFor(() => expect(adminService.transitionSupportCase).toHaveBeenCalledWith("case-1", "IN_PROGRESS"));
  });
});
