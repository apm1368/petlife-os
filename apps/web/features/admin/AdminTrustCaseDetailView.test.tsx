import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { TrustCaseDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { adminAnimalSupportService } from "@/services/admin-animal-support.service";
import { ApiError } from "@/lib/api/client";
import { AdminTrustCaseDetailView } from "./AdminTrustCaseDetailView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({
  adminService: { getTrustCase: vi.fn(), assignTrustCase: vi.fn(), transitionTrustCase: vi.fn(), takeTrustAction: vi.fn(), submitAppeal: vi.fn(), resolveAppeal: vi.fn() },
}));
vi.mock("@/services/admin-animal-support.service", () => ({
  adminAnimalSupportService: { trustCaseContext: vi.fn() },
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
    vi.mocked(adminAnimalSupportService.trustCaseContext).mockReset().mockResolvedValue({ trustCaseId: "trust-1", subjectType: "SELLER", subjectId: "seller-1", subject: null, reports: { total: 0, distinctReporters: 0, byReason: {}, items: [] }, availableActions: ["WARNING"] });
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
      effectSummary: null,
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
          effectSummary: null,
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

  it.each(["de", "es"] as const)("renders trust detail and moderated context in %s with locale dates and no Persian UI", async (locale) => {
    vi.mocked(adminAnimalSupportService.trustCaseContext).mockResolvedValue({
      trustCaseId: "trust-1", subjectType: "COMMUNITY_CONTENT", subjectId: "post-1",
      subject: { kind: "POST", title: "Authored post title", text: "Authored report excerpt", status: "OPEN", owner: "Reporter display name", link: "/community/posts/post-1" },
      reports: { total: 2, distinctReporters: 2, byReason: { SPAM: 2 }, items: [{ id: "report-1", reason: "SPAM", details: "Authored report detail", status: "OPEN", createdAt: "2026-01-01T00:00:00.000Z" }] },
      availableActions: ["WARNING", "REMOVE_CONTENT"],
    });
    vi.mocked(adminService.getTrustCase).mockResolvedValue({ ...CASE, actions: [{ id: "action-1", trustCaseId: "trust-1", actionType: "WARNING" as never, reason: "Authored admin reason", performedByAdmin: { id: "admin-1", displayName: "Admin name", role: "TRUST_SAFETY" as never }, createdAt: "2026-01-01T00:00:00.000Z", effectSummary: { before: { status: "PUBLISHED" }, after: { status: "REMOVED" } }, appeal: null }] });
    const { container } = renderWithIntl(<AdminTrustCaseDetailView trustCaseId="trust-1" />, locale);
    await waitFor(() => expect(container.textContent).toContain(locale === "de" ? "Fallgegenstand" : "Asunto del caso"));
    expect(container.textContent).toContain("Authored post title");
    expect(container.textContent).toContain("Authored report detail");
    expect(container.textContent).toContain(locale === "de" ? "Veröffentlicht" : "Publicado");
    expect(container.querySelector(`a[href="/${locale}/community/posts/post-1"]`)).toBeTruthy();
    const dateText = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date("2026-01-01T00:00:00.000Z"));
    expect(container.textContent).toContain(dateText);
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([["de", "Diese Maßnahme kann im aktuellen Zustand des Gegenstands nicht angewendet werden."], ["es", "No se puede aplicar esta acción al estado actual del asunto."]] as const)("localizes trust action failures in %s", async (locale, message) => {
    vi.mocked(adminService.takeTrustAction).mockRejectedValueOnce(new ApiError({ code: "TRUST_ACTION_NOT_APPLICABLE", message: "backend detail", requestId: "action-request" }, 409));
    renderWithIntl(<AdminTrustCaseDetailView trustCaseId="trust-1" />, locale);
    await waitFor(() => expect(screen.getByText("Repeated late shipments")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Begründung" : "Motivo"), { target: { value: "Policy reason" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Maßnahme ergreifen" : "Aplicar acción" }));
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
  });
});
