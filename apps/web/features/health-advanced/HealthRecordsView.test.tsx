import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { clinicalOwnerService } from "@/services/vet-panel.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { usePetAccess } from "@/hooks/use-pet-access";
import { HealthRecordsView } from "./HealthRecordsView";

vi.mock("@/hooks/use-pet-access", () => ({ usePetAccess: vi.fn() }));
vi.mock("@/services/vet-panel.service", () => ({
  clinicalOwnerService: {
    listProblems: vi.fn(), listPrescriptions: vi.fn(),
  },
}));
vi.mock("@/services/health-advanced.service", () => ({
  healthAdvancedService: {
    listCarePlans: vi.fn(), listSeniorCare: vi.fn(), addSeniorCareNote: vi.fn(), getEndOfLife: vi.fn(),
    listCorrections: vi.fn(), upsertEndOfLife: vi.fn(),
  },
}));

describe("HealthRecordsView localization", () => {
  beforeEach(() => {
    vi.mocked(usePetAccess).mockReturnValue({ access: { canViewHealth: true, canEditHealth: true } } as never);
    vi.mocked(clinicalOwnerService.listProblems).mockResolvedValue([] as never);
    vi.mocked(clinicalOwnerService.listPrescriptions).mockResolvedValue([] as never);
    vi.mocked(healthAdvancedService.listCarePlans).mockResolvedValue([] as never);
    vi.mocked(healthAdvancedService.listSeniorCare).mockResolvedValue([] as never);
    vi.mocked(healthAdvancedService.addSeniorCareNote).mockResolvedValue({ id: "senior-1", createdAt: "2026-01-01T00:00:00.000Z", mobilityNotes: "Owner-authored mobility note" } as never);
    vi.mocked(healthAdvancedService.getEndOfLife).mockResolvedValue(null as never);
    vi.mocked(healthAdvancedService.listCorrections).mockResolvedValue([] as never);
  });

  it.each([
    ["fa", "سوابق بالینی", "فهرست مشکلات بالینی", "نسخه‌ها", "برنامه‌های مراقبت", "مراقبت در سالمندی", "ترجیحات مراقبت حمایتی", "درخواست‌های اصلاح"],
    ["en", "Clinical records", "Problem list", "Prescriptions", "Care plans", "Senior care", "Supportive care preferences", "Correction requests"],
    ["de", "Klinische Akte", "Erkrankungsliste", "Verordnungen", "Pflegepläne", "Seniorenbetreuung", "Präferenzen zur unterstützenden Versorgung", "Korrekturanfragen"],
    ["es", "Historia clínica", "Lista de afecciones", "Prescripciones", "Planes de cuidados", "Cuidados para mascotas mayores", "Preferencias de cuidados de apoyo", "Solicitudes de corrección"],
  ] as const)("renders every clinical record tab in %s", async (locale, title, problems, prescriptions, plans, senior, planning, corrections) => {
    const { container } = renderWithIntl(<HealthRecordsView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    for (const label of [problems, prescriptions, plans, senior, planning, corrections]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    if (locale === "de" || locale === "es") expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Klinische Akte", "Es wurden noch keine Einträge geteilt."],
    ["es", "Historia clínica", "Todavía no se han compartido registros."],
  ] as const)("localizes empty and permission-denied states in %s", async (locale, title, empty) => {
    const { container, unmount } = renderWithIntl(<HealthRecordsView petId="pet-1" />, locale);
    expect(await screen.findByText(empty)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    const callsBeforeNoAccess = vi.mocked(clinicalOwnerService.listProblems).mock.calls.length;
    unmount();
    vi.mocked(usePetAccess).mockReturnValue({ access: { canViewHealth: false, canEditHealth: false } } as never);
    renderWithIntl(<HealthRecordsView petId="pet-1" />, locale);
    expect(await screen.findByText(locale === "de" ? "Du hast keinen Zugriff auf diese Gesundheitsakte." : "No tienes acceso a estos registros de salud.")).toBeTruthy();
    expect(vi.mocked(clinicalOwnerService.listProblems).mock.calls).toHaveLength(callsBeforeNoAccess);
  });

  it.each([
    ["de", "Beweglichkeit", "Änderungen speichern"],
    ["es", "Movilidad", "Guardar cambios"],
  ] as const)("localizes planning form and saves entered notes in %s", async (locale, mobility, save) => {
    renderWithIntl(<HealthRecordsView petId="pet-1" />, locale);
    await screen.findByRole("heading", { name: locale === "de" ? "Klinische Akte" : "Historia clínica" });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Seniorenbetreuung" : "Cuidados para mascotas mayores" }));
    const field = screen.getByLabelText(mobility);
    fireEvent.change(field, { target: { value: "Owner-authored mobility note" } });
    fireEvent.click(screen.getByRole("button", { name: save }));
    expect(await screen.findByText(locale === "de" ? "Änderungen gespeichert." : "Cambios guardados.")).toBeTruthy();
    expect(healthAdvancedService.addSeniorCareNote).toHaveBeenCalledWith("pet-1", expect.objectContaining({ mobilityNotes: "Owner-authored mobility note" }));
  });

  it.each([
    ["de", "Die Einträge konnten nicht geladen werden."],
    ["es", "No se pudieron cargar los registros."],
  ] as const)("localizes load failure and retry in %s", async (locale, failure) => {
    vi.mocked(clinicalOwnerService.listProblems).mockRejectedValueOnce(new Error("network"));
    renderWithIntl(<HealthRecordsView petId="pet-1" />, locale);
    expect(await screen.findByText(failure)).toBeTruthy();
    expect(screen.getByRole("button", { name: locale === "de" ? "Erneut versuchen" : "Reintentar" })).toBeTruthy();
  });

  it.each([
    ["de", "Klinische Akte"],
    ["es", "Historia clínica"],
  ] as const)("localizes the loading state in %s", (locale, loadingLabel) => {
    vi.mocked(clinicalOwnerService.listProblems).mockImplementation(() => new Promise(() => undefined));
    renderWithIntl(<HealthRecordsView petId="pet-1" />, locale);
    expect(screen.getByLabelText(loadingLabel)).toBeTruthy();
  });
});
