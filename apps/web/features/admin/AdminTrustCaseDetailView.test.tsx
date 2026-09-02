import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { TrustCaseDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminTrustCaseDetailView } from "./AdminTrustCaseDetailView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({
  adminService: { getTrustCase: vi.fn(), assignTrustCase: vi.fn(), transitionTrustCase: vi.fn(), takeTrustAction: vi.fn(), submitAppeal: vi.fn(), resolveAppeal: vi.fn() },
}));

const CASE: TrustCaseDto = {
  id: "trust-1",
  subjectType: "SELLER" as never,
  subjectId: "seller-1",
  reason: "Repeated late shipments",
  severity: "HIGH" as never,
  status: "OPEN" as never,
  assignedAdmin: null,
  openedByAdmin: { id: "a1", displayName: "Admin", role: "TRUST_SAFETY" as never },
  actions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  closedAt: null,
};

describe("AdminTrustCaseDetailView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminService.getTrustCase).mockReset().mockResolvedValue(CASE);
    vi.mocked(adminService.assignTrustCase).mockReset();
    vi.mocked(adminService.transitionTrustCase).mockReset();
    vi.mocked(adminService.takeTrustAction).mockReset();
  });

  it("shows the case reason and takes a trust action", async () => {
    vi.mocked(adminService.takeTrustAction).mockResolvedValue({
      id: "action-1",
      trustCaseId: "trust-1",
      actionType: "SUSPEND" as never,
      reason: "Pattern of non-fulfillment",
      performedByAdmin: { id: "a1", displayName: "Admin", role: "TRUST_SAFETY" as never },
      createdAt: "2026-01-01T00:00:00.000Z",
      appeal: null,
    });

    renderWithIntl(<AdminTrustCaseDetailView trustCaseId="trust-1" />);
    await waitFor(() => expect(screen.getByText("Repeated late shipments")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Pattern of non-fulfillment" } });
    fireEvent.click(screen.getByRole("button", { name: "Take action" }));

    await waitFor(() => expect(adminService.takeTrustAction).toHaveBeenCalledWith("trust-1", { actionType: "WARNING", reason: "Pattern of non-fulfillment" }));
  });

  it("shows an existing action and lets an appeal be submitted for it", async () => {
    vi.mocked(adminService.getTrustCase).mockResolvedValue({
      ...CASE,
      actions: [
        {
          id: "action-1",
          trustCaseId: "trust-1",
          actionType: "SUSPEND" as never,
          reason: "Pattern of non-fulfillment",
          performedByAdmin: { id: "a1", displayName: "Admin", role: "TRUST_SAFETY" as never },
          createdAt: "2026-01-01T00:00:00.000Z",
          appeal: null,
        },
      ],
    });
    vi.mocked(adminService.submitAppeal).mockResolvedValue({
      id: "appeal-1",
      trustActionId: "action-1",
      appellantUserId: "seller-user-1",
      reason: "We shipped on time",
      status: "SUBMITTED" as never,
      resolution: null,
      reviewerAdmin: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
    });

    renderWithIntl(<AdminTrustCaseDetailView trustCaseId="trust-1" />);
    await waitFor(() => expect(screen.getByText("Pattern of non-fulfillment")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Appellant user ID"), { target: { value: "seller-user-1" } });
    fireEvent.change(screen.getByLabelText("Appeal reason"), { target: { value: "We shipped on time" } });
    fireEvent.click(screen.getByText("Submit appeal"));

    await waitFor(() => expect(adminService.submitAppeal).toHaveBeenCalledWith("action-1", { appellantUserId: "seller-user-1", reason: "We shipped on time" }));
  });
});
