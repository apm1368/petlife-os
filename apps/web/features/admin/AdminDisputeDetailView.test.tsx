import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { DisputeDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { ApiError } from "@/lib/api/client";
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

  it.each(["de", "es"] as const)("translates dispute details and formats dates in %s", async (locale) => {
    vi.mocked(adminService.getDispute).mockResolvedValue({ ...DISPUTE, evidence: [{ id: "e1", disputeId: "dispute-1", actorType: "ADMIN" as never, actor: { id: "a1", displayName: "Admin", role: "TRUST_SAFETY" as never }, statement: "Evidence text", attachmentRef: null, createdAt: "2026-01-01T00:00:00.000Z" }] });
    const { container } = renderWithIntl(<AdminDisputeDetailView disputeId="dispute-1" />, locale);
    await waitFor(() => expect(container.textContent).toContain(locale === "de" ? "Finanzielle Vorgänge" : "Los movimientos financieros"));
    expect(screen.getByText("Evidence text")).toBeTruthy();
    expect(container.textContent).toContain("Admin ·"); // authored admin display name is retained verbatim
    const formatted = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date("2026-01-01T00:00:00.000Z"));
    expect(container.textContent).toContain(formatted);
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([["de", "Noch keine Belege hinzugefügt."], ["es", "Todavía no se han añadido pruebas."]] as const)("shows the localized empty evidence state in %s", async (locale, empty) => {
    renderWithIntl(<AdminDisputeDetailView disputeId="dispute-1" />, locale);
    await waitFor(() => expect(screen.getByText(empty)).toBeTruthy());
  });

  it.each([["de", 403, "Kein Zugriff"], ["es", 404, "Disputa no encontrada"]] as const)("shows localized access and missing-record states in %s", async (locale, status, title) => {
    vi.mocked(adminService.getDispute).mockRejectedValueOnce(new ApiError({ code: status === 403 ? "FORBIDDEN" : "NOT_FOUND", message: "private API detail", requestId: "r2" }, status));
    renderWithIntl(<AdminDisputeDetailView disputeId="missing" />, locale);
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.queryByText("private API detail")).toBeNull();
  });

  it.each([["de", "Die Änderung konnte nicht gespeichert werden"], ["es", "No se pudo guardar el cambio"]] as const)("localizes action failure in %s", async (locale, failure) => {
    vi.mocked(adminService.transitionDispute).mockRejectedValueOnce(new Error("internal API error"));
    renderWithIntl(<AdminDisputeDetailView disputeId="dispute-1" />, locale);
    await waitFor(() => expect(screen.getByText("Item never arrived")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Wird geprüft" : "En revisión" }));
    await waitFor(() => expect(screen.getByText(new RegExp(failure))).toBeTruthy());
    expect(screen.queryByText("internal API error")).toBeNull();
  });
});
