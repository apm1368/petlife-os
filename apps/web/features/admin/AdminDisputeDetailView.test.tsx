import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { DisputeDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminDisputeDetailView } from "./AdminDisputeDetailView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({
  adminService: { getDispute: vi.fn(), assignDispute: vi.fn(), addDisputeEvidence: vi.fn(), transitionDispute: vi.fn() },
}));

const DISPUTE: DisputeDto = {
  id: "dispute-1",
  subjectType: "ORDER" as never,
  subjectId: "order-1",
  raisedByUserId: "user-1",
  supportCaseId: null,
  claim: "Item never arrived",
  status: "OPEN" as never,
  assignedAdmin: null,
  resolutionSummary: null,
  evidence: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  resolvedAt: null,
  closedAt: null,
};

describe("AdminDisputeDetailView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminService.getDispute).mockReset().mockResolvedValue(DISPUTE);
    vi.mocked(adminService.assignDispute).mockReset();
    vi.mocked(adminService.addDisputeEvidence).mockReset();
    vi.mocked(adminService.transitionDispute).mockReset();
  });

  it("shows the claim and a note that financial state is tracked separately", async () => {
    renderWithIntl(<AdminDisputeDetailView disputeId="dispute-1" />);

    await waitFor(() => expect(screen.getByText("Item never arrived")).toBeTruthy());
    expect(screen.getByText(/Financial state \(refunds\) is tracked separately/)).toBeTruthy();
  });

  it("adds evidence to the dispute", async () => {
    vi.mocked(adminService.addDisputeEvidence).mockResolvedValue({ id: "ev-1", disputeId: "dispute-1", actorType: "ADMIN" as never, actor: { id: "a1", displayName: "Admin", role: "TRUST_SAFETY" as never }, statement: "Tracking shows no delivery.", attachmentRef: null, createdAt: "2026-01-01T00:00:00.000Z" });

    renderWithIntl(<AdminDisputeDetailView disputeId="dispute-1" />);
    await waitFor(() => expect(screen.getByText("Item never arrived")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Statement"), { target: { value: "Tracking shows no delivery." } });
    fireEvent.click(screen.getByText("Add evidence"));

    await waitFor(() => expect(adminService.addDisputeEvidence).toHaveBeenCalledWith("dispute-1", { statement: "Tracking shows no delivery.", actorType: "ADMIN" }));
  });

  it("transitions the dispute to a resolution status", async () => {
    vi.mocked(adminService.transitionDispute).mockResolvedValue({ ...DISPUTE, status: "UNDER_REVIEW" as never });

    renderWithIntl(<AdminDisputeDetailView disputeId="dispute-1" />);
    await waitFor(() => expect(screen.getByText("Item never arrived")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Under review" }));

    await waitFor(() => expect(adminService.transitionDispute).toHaveBeenCalledWith("dispute-1", "UNDER_REVIEW", undefined));
  });
});
