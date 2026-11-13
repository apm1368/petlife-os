import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, SupportCaseSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { ApiError } from "@/lib/api/client";
import { AdminSupportQueueView } from "./AdminSupportQueueView";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), useSearchParams: () => new URLSearchParams(search) }));
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
    replace.mockReset();
    search = "";
  });

  it("keeps partner cases on their own tab and names the business", async () => {
    const partnerCase: SupportCaseSummaryDto = { ...CASE, id: "case-p", caseNumber: "CASE-000077", requesterOrganization: { type: "SELLER", id: "org-1", name: "Pet Corner" } };
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([partnerCase]));

    renderWithIntl(<AdminSupportQueueView />);
    await waitFor(() => expect(screen.getByText("CASE-000077")).toBeTruthy());
    expect(screen.getByText(/Shop: Pet Corner/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Partners" }));
    await waitFor(() => expect(adminService.listSupportCases).toHaveBeenLastCalledWith(expect.objectContaining({ requesterKind: "PARTNER" })));
    expect(replace).toHaveBeenCalledWith("/en/admin/support?requester=PARTNER");
  });

  it("opens on one business when the link names it", async () => {
    search = "requester=PROVIDER&org=00000000-0000-4000-8000-000000000001";
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([]));

    renderWithIntl(<AdminSupportQueueView />);
    await waitFor(() => expect(adminService.listSupportCases).toHaveBeenCalledWith(expect.objectContaining({ requesterKind: "PROVIDER", requesterOrgId: "00000000-0000-4000-8000-000000000001" })));
    expect(screen.getByRole("tab", { name: "Services", selected: true })).toBeTruthy();
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

    await waitFor(() => expect(screen.getByText("No support cases found")).toBeTruthy());
  });

  it("creates a new support case and navigates to it", async () => {
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([]));
    vi.mocked(adminService.createSupportCase).mockResolvedValue({ ...CASE, id: "case-2", caseNumber: "CASE-000002" });

    renderWithIntl(<AdminSupportQueueView />);
    await waitFor(() => expect(screen.getByText("No support cases found")).toBeTruthy());

    fireEvent.click(screen.getByText("New case"));
    fireEvent.change(screen.getByLabelText("Requester user ID"), { target: { value: "user-9" } });
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Billing question" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Overcharged" } });
    fireEvent.click(screen.getByText("Create case"));

    await waitFor(() => expect(adminService.createSupportCase).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/en/admin/support/case-2");
  });

  it.each([["de", "Supportfälle", "Offen"], ["es", "Casos de soporte", "Abierto"]] as const)("renders the complete queue interface in %s without Persian UI", async (locale, title, openStatus) => {
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([CASE]));
    const { container } = renderWithIntl(<AdminSupportQueueView />, locale);

    await waitFor(() => expect(screen.getByRole("heading", { name: title })).toBeTruthy());
    expect(screen.getAllByText(openStatus).length).toBeGreaterThan(0);
    expect(screen.getByText(locale === "de" ? "Buchung" : "Reserva")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([["de", "Supportfälle konnten nicht geladen werden"], ["es", "No se pudieron cargar los casos de soporte"]] as const)("localizes queue failure in %s", async (locale, failureText) => {
    vi.mocked(adminService.listSupportCases).mockRejectedValueOnce(new Error("backend detail must not leak"));
    renderWithIntl(<AdminSupportQueueView />, locale);
    await waitFor(() => expect(screen.getByText(new RegExp(failureText))).toBeTruthy());
    expect(screen.queryByText("backend detail must not leak")).toBeNull();
  });

  it.each([["de", "Keine Supportfälle gefunden"], ["es", "No se encontraron casos de soporte"]] as const)("localizes the queue empty state in %s", async (locale, emptyText) => {
    vi.mocked(adminService.listSupportCases).mockResolvedValueOnce(page([]));
    renderWithIntl(<AdminSupportQueueView />, locale);
    await waitFor(() => expect(screen.getByText(emptyText)).toBeTruthy());
  });

  it.each([["de", "Kein Zugriff"], ["es", "Sin acceso"]] as const)("shows a localized access-denied state in %s", async (locale, title) => {
    vi.mocked(adminService.listSupportCases).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "sensitive backend detail", requestId: "request-1" }, 403));
    renderWithIntl(<AdminSupportQueueView />, locale);
    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(screen.queryByText("sensitive backend detail")).toBeNull();
  });

  it.each([["de", "Nutzer-ID, Betreff und Beschreibung sind erforderlich."], ["es", "El ID de usuario, el asunto y la descripción son obligatorios."]] as const)("localizes create validation in %s", async (locale, message) => {
    vi.mocked(adminService.listSupportCases).mockResolvedValue(page([]));
    renderWithIntl(<AdminSupportQueueView />, locale);
    await waitFor(() => expect(screen.getByText(locale === "de" ? "Keine Supportfälle gefunden" : "No se encontraron casos de soporte")).toBeTruthy());
    fireEvent.click(screen.getByText(locale === "de" ? "Neuer Fall" : "Nuevo caso"));
    fireEvent.click(screen.getByText(locale === "de" ? "Fall erstellen" : "Crear caso"));
    expect(screen.getByText(message)).toBeTruthy();
    expect(adminService.createSupportCase).not.toHaveBeenCalled();
  });
});
