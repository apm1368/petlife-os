import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminAuditLogDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminAuditView } from "./AdminAuditView";

vi.mock("@/services/admin.service", () => ({ adminService: { listAudit: vi.fn() } }));

const entry = {
  id: "audit-1",
  adminUser: { id: "admin-1", displayName: "Marta Admin", role: "SUPER_ADMIN" },
  action: "role.scope_changed",
  entityType: "AdminUser",
  entityId: "user-42",
  reason: "Approved access update",
  beforeSummary: null,
  afterSummary: null,
  requestId: "request-1",
  createdAt: "2026-11-08T13:00:00.000Z",
} as AdminAuditLogDto;

describe("Admin audit page localization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(adminService.listAudit).mockResolvedValue({ items: [entry], total: 1, page: 1, pageSize: 50 });
  });

  it.each([
    ["fa", "گزارش رویدادها", "نوع موجودیت", "شناسه موجودیت", "دلیل", "توسط Marta Admin"],
    ["en", "Audit trail", "Entity type", "Entity ID", "Reason", "By Marta Admin"],
    ["de", "Prüfprotokoll", "Entitätstyp", "Entitäts-ID", "Begründung", "Von Marta Admin"],
    ["es", "Registro de auditoría", "Tipo de entidad", "ID de entidad", "Motivo", "Por Marta Admin"],
  ] as const)("renders all audit interface labels in %s while preserving recorded evidence", async (locale, title, entityType, entityId, reason, byline) => {
    renderWithIntl(<AdminAuditView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && Boolean(element.textContent?.includes(`${entityType}: AdminUser`)))).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && Boolean(element.textContent?.includes(`${entityId}: user-42`)))).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && Boolean(element.textContent?.includes(`role.scope_changed`)))).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && Boolean(element.textContent?.includes("AdminUser")))).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && Boolean(element.textContent?.includes(`${reason}: Approved access update`)))).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && Boolean(element.textContent?.includes(byline)))).toBeTruthy();
    if (locale !== "fa") expect(screen.queryByText("گزارش رویدادها")).toBeNull();
    if (locale === "de" || locale === "es") expect(screen.queryByText(/Missing (de|es)/)).toBeNull();

    const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-US";
    const expectedDate = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt));
    expect(screen.getByText(expectedDate)).toBeTruthy();
  });

  it.each([
    ["fa", "در حال بارگذاری…", "هنوز رویدادی در گزارش ممیزی ثبت نشده است.", "بارگذاری گزارش ممیزی انجام نشد. دوباره تلاش کنید.", "تلاش دوباره"],
    ["en", "Loading…", "No audit events have been recorded yet.", "The audit trail could not be loaded. Please try again.", "Retry"],
    ["de", "Wird geladen …", "Es wurden noch keine Prüfereignisse aufgezeichnet.", "Das Prüfprotokoll konnte nicht geladen werden. Bitte versuche es erneut.", "Erneut versuchen"],
    ["es", "Cargando…", "Todavía no se han registrado eventos de auditoría.", "No se pudo cargar el registro de auditoría. Inténtalo de nuevo.", "Reintentar"],
  ] as const)("localizes loading, empty, failure and retry states in %s", async (locale, loading, empty, loadError, retry) => {
    let resolve!: (value: { items: AdminAuditLogDto[]; total: number; page: number; pageSize: number }) => void;
    vi.mocked(adminService.listAudit).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { unmount } = renderWithIntl(<AdminAuditView />, locale);
    expect(screen.getByLabelText(loading)).toBeTruthy();
    resolve({ items: [], total: 0, page: 1, pageSize: 50 });
    expect(await screen.findByText(empty)).toBeTruthy();

    unmount();
    vi.mocked(adminService.listAudit).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<AdminAuditView />, locale);
    expect(await screen.findByText(loadError)).toBeTruthy();
    vi.mocked(adminService.listAudit).mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 50 });
    fireEvent.click(screen.getByRole("button", { name: retry }));
    await waitFor(() => expect(adminService.listAudit).toHaveBeenCalledTimes(3));
    expect(await screen.findByText(empty)).toBeTruthy();
  });

  it("keeps Persian audit dates on the Jalali calendar", async () => {
    renderWithIntl(<AdminAuditView />, "fa");
    const date = await screen.findByText(/۱۴۰۵/);
    expect(date.textContent).not.toContain("2026");
  });
});
