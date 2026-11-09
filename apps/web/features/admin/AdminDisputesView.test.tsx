import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { DisputeDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { ApiError } from "@/lib/api/client";
import { AdminDisputesView } from "./AdminDisputesView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({ adminService: { listDisputes: vi.fn(), createDispute: vi.fn() } }));

const DISPUTE: DisputeDto = {
  id: "dispute-1", subjectType: "ORDER" as never, subjectId: "order-1", raisedByUserId: "user-1", supportCaseId: null,
  claim: "Item never arrived", status: "OPEN" as never, assignedAdmin: null, resolutionSummary: null, evidence: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", resolvedAt: null, closedAt: null,
};
const page = (items: DisputeDto[]): PaginatedDto<DisputeDto> => ({ items, total: items.length, page: 1, pageSize: 50 });

describe("AdminDisputesView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminService.listDisputes).mockReset();
    vi.mocked(adminService.createDispute).mockReset();
  });

  it.each([["de", "Streitfälle", "Offen"], ["es", "Disputas", "Abierta"]] as const)("renders the complete dispute queue in %s without Persian UI", async (locale, title, status) => {
    vi.mocked(adminService.listDisputes).mockResolvedValue(page([DISPUTE]));
    const { container } = renderWithIntl(<AdminDisputesView />, locale);
    await waitFor(() => expect(screen.getByRole("heading", { name: title })).toBeTruthy());
    expect(screen.getAllByText(status).length).toBeGreaterThan(0);
    expect(screen.getByText("Item never arrived")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([["de", "Keine Streitfälle gefunden"], ["es", "No se encontraron disputas"]] as const)("localizes the empty queue in %s", async (locale, empty) => {
    vi.mocked(adminService.listDisputes).mockResolvedValue(page([]));
    renderWithIntl(<AdminDisputesView />, locale);
    await waitFor(() => expect(screen.getByText(empty)).toBeTruthy());
  });

  it.each([["de", "Streitfälle konnten nicht geladen werden"], ["es", "No se pudieron cargar las disputas"]] as const)("localizes a queue error in %s without leaking API details", async (locale, error) => {
    vi.mocked(adminService.listDisputes).mockRejectedValueOnce(new Error("private API detail"));
    renderWithIntl(<AdminDisputesView />, locale);
    await waitFor(() => expect(screen.getByText(new RegExp(error))).toBeTruthy());
    expect(screen.queryByText("private API detail")).toBeNull();
  });

  it.each([["de", "Kein Zugriff"], ["es", "Sin acceso"]] as const)("shows an access-denied state in %s", async (locale, title) => {
    vi.mocked(adminService.listDisputes).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "private", requestId: "r1" }, 403));
    renderWithIntl(<AdminDisputesView />, locale);
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.queryByText("private")).toBeNull();
  });

  it.each([["de", "Bezug-ID und Schilderung sind erforderlich."], ["es", "El ID del asunto y la reclamación son obligatorios."]] as const)("localizes required-field feedback in %s", async (locale, message) => {
    vi.mocked(adminService.listDisputes).mockResolvedValue(page([]));
    renderWithIntl(<AdminDisputesView />, locale);
    await waitFor(() => expect(screen.getByText(locale === "de" ? "Keine Streitfälle gefunden" : "No se encontraron disputas")).toBeTruthy());
    fireEvent.click(screen.getByText(locale === "de" ? "Neuer Streitfall" : "Nueva disputa"));
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Streitfall eröffnen" : "Abrir disputa" }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(adminService.createDispute).not.toHaveBeenCalled();
  });

  it.each([["de", "Der Streitfall konnte nicht eröffnet werden"], ["es", "No se pudo abrir la disputa"]] as const)("shows a localized dispute-creation failure in %s", async (locale, message) => {
    vi.mocked(adminService.listDisputes).mockResolvedValue(page([]));
    vi.mocked(adminService.createDispute).mockRejectedValueOnce(new Error("raw API error"));
    renderWithIntl(<AdminDisputesView />, locale);
    await waitFor(() => expect(screen.getByText(locale === "de" ? "Keine Streitfälle gefunden" : "No se encontraron disputas")).toBeTruthy());
    fireEvent.click(screen.getByText(locale === "de" ? "Neuer Streitfall" : "Nueva disputa"));
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Bezug-ID" : "ID del asunto"), { target: { value: "order-9" } });
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Schilderung" : "Reclamación"), { target: { value: "Delivery missing" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Streitfall eröffnen" : "Abrir disputa" }));
    await waitFor(() => expect(screen.getByText(new RegExp(message))).toBeTruthy());
    expect(screen.queryByText("raw API error")).toBeNull();
  });
});
