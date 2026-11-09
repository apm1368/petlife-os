import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, TrustCaseDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { ApiError } from "@/lib/api/client";
import { AdminTrustView } from "./AdminTrustView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/admin.service", () => ({ adminService: { listTrustCases: vi.fn(), openTrustCase: vi.fn() } }));

const TRUST_CASE: TrustCaseDto = {
  id: "trust-1", subjectType: "SELLER" as never, subjectId: "seller-1", reason: "Repeated late shipments", severity: "HIGH" as never,
  status: "OPEN" as never, assignedAdmin: null, openedByAdmin: { id: "admin-1", displayName: "Admin", role: "TRUST_SAFETY" as never },
  actions: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", closedAt: null,
};
const page = (items: TrustCaseDto[]): PaginatedDto<TrustCaseDto> => ({ items, total: items.length, page: 1, pageSize: 50 });

describe("AdminTrustView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(adminService.listTrustCases).mockReset();
    vi.mocked(adminService.openTrustCase).mockReset();
  });

  it.each([["de", "Vertrauen und Sicherheit", "Offen"], ["es", "Confianza y seguridad", "Abierto"]] as const)("renders trust queue controls in %s without Persian UI", async (locale, title, status) => {
    vi.mocked(adminService.listTrustCases).mockResolvedValue(page([TRUST_CASE]));
    const { container } = renderWithIntl(<AdminTrustView />, locale);
    await waitFor(() => expect(screen.getByRole("heading", { name: title })).toBeTruthy());
    expect(screen.getAllByText(status).length).toBeGreaterThan(0);
    expect(screen.getByText("Repeated late shipments")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([["de", "Keine Vertrauensfälle gefunden"], ["es", "No se encontraron casos de confianza"]] as const)("shows a translated empty queue in %s", async (locale, empty) => {
    vi.mocked(adminService.listTrustCases).mockResolvedValue(page([]));
    renderWithIntl(<AdminTrustView />, locale);
    await waitFor(() => expect(screen.getByText(empty)).toBeTruthy());
  });

  it.each([["de", "Vertrauensfälle konnten nicht geladen werden"], ["es", "No se pudieron cargar los casos de confianza"]] as const)("shows a localized request failure in %s", async (locale, failure) => {
    vi.mocked(adminService.listTrustCases).mockRejectedValueOnce(new Error("private API details"));
    renderWithIntl(<AdminTrustView />, locale);
    await waitFor(() => expect(screen.getByText(new RegExp(failure))).toBeTruthy());
    expect(screen.queryByText("private API details")).toBeNull();
  });

  it.each([["de", "Kein Zugriff"], ["es", "Sin acceso"]] as const)("renders the access-denied state in %s", async (locale, title) => {
    vi.mocked(adminService.listTrustCases).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "private", requestId: "trust-request" }, 403));
    renderWithIntl(<AdminTrustView />, locale);
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.queryByText("private")).toBeNull();
  });

  it.each([["de", "Bezug-ID und Begründung sind erforderlich."], ["es", "El ID del asunto y el motivo son obligatorios."]] as const)("validates required fields in %s", async (locale, message) => {
    vi.mocked(adminService.listTrustCases).mockResolvedValue(page([]));
    renderWithIntl(<AdminTrustView />, locale);
    await waitFor(() => expect(screen.getByText(locale === "de" ? "Keine Vertrauensfälle gefunden" : "No se encontraron casos de confianza")).toBeTruthy());
    fireEvent.click(screen.getByText(locale === "de" ? "Vertrauensfall eröffnen" : "Abrir caso de confianza"));
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Fall eröffnen" : "Abrir caso" }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(adminService.openTrustCase).not.toHaveBeenCalled();
  });
});
