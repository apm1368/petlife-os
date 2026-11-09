import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { MedicalDocumentDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { usePetAccess } from "@/hooks/use-pet-access";
import { HealthDocumentDetailView } from "./HealthDocumentDetailView";

vi.mock("@/services/health-advanced.service", () => ({
  healthAdvancedService: { getDocument: vi.fn(), downloadDocument: vi.fn(), createCorrection: vi.fn(), voidDocument: vi.fn() },
}));
vi.mock("@/hooks/use-pet-access", () => ({ usePetAccess: vi.fn(() => ({ access: null })) }));

const doc = {
  id: "doc-1", petId: "pet-1", householdId: "household-1", documentType: "LAB_REPORT", title: "Blood test",
  description: "Results as recorded by the clinic.", sourceType: "PROVIDER", source: { providerOrganizationId: "clinic-1", providerOrganizationName: "Clinic Name", providerUserId: null, providerUserDisplayTitle: null, userId: null },
  recordedAt: "2026-08-01T00:00:00.000Z", uploadedAt: "2026-08-01T00:00:00.000Z", mimeType: "application/pdf", fileSizeBytes: 1024,
  visibility: "HOUSEHOLD_ONLY", verificationStatus: "PROVIDER_VERIFIED", relatedVisitId: null, relatedLabResultId: null,
  relatedImagingStudyId: null, relatedReferralId: null, voidedAt: null, voidedReason: null,
} as MedicalDocumentDto;

describe("HealthDocumentDetailView localization", () => {
  beforeEach(() => {
    vi.mocked(healthAdvancedService.getDocument).mockReset();
    vi.mocked(healthAdvancedService.downloadDocument).mockReset();
    vi.mocked(healthAdvancedService.createCorrection).mockReset();
    vi.mocked(healthAdvancedService.voidDocument).mockReset();
    vi.mocked(usePetAccess).mockReturnValue({ access: null } as never);
  });

  it.each([
    ["fa", "بازگشت به اسناد", "نتیجهٔ آزمایش", "حریم خصوصی", "این فایل خصوصی است"],
    ["en", "Back to documents", "Lab report", "Privacy", "This file is private"],
    ["de", "Zurück zu den Dokumenten", "Laborbericht", "Datenschutz", "Diese Datei ist privat"],
    ["es", "Volver a los documentos", "Informe de laboratorio", "Privacidad", "Este archivo es privado"],
  ] as const)("renders full document detail chrome and preserves clinical content in %s", async (locale, back, kind, privacy, noticePrefix) => {
    vi.mocked(healthAdvancedService.getDocument).mockResolvedValue(doc);
    const view = renderWithIntl(<HealthDocumentDetailView petId="pet-1" documentId="doc-1" />, locale);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Blood test" })).toBeTruthy());
    expect(screen.getByText(back)).toBeTruthy();
    expect(screen.getByText(kind)).toBeTruthy();
    expect(screen.getByText(privacy)).toBeTruthy();
    expect(screen.getByText(new RegExp(noticePrefix))).toBeTruthy();
    expect(screen.getByText("Clinic Name")).toBeTruthy();
    expect(screen.getByText("Results as recorded by the clinic.")).toBeTruthy();
    expect(screen.getByText(locale === "fa" ? "تأییدشده توسط مرکز درمانی" : locale === "en" ? "Verified by provider" : locale === "de" ? "Von der Tierarztpraxis bestätigt" : "Verificado por la clínica veterinaria")).toBeTruthy();
    if (locale !== "fa") expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["fa", "در حال بارگذاری سند", "سند در دسترس نیست.", "تلاش دوباره"],
    ["en", "Loading document", "The document is unavailable.", "Try again"],
    ["de", "Dokument wird geladen", "Das Dokument ist nicht verfügbar.", "Erneut versuchen"],
    ["es", "Cargando documento", "El documento no está disponible.", "Reintentar"],
  ] as const)("localizes loading, unavailable, and retry states in %s", async (locale, loading, unavailable, retry) => {
    let resolveInitial!: (value: MedicalDocumentDto) => void;
    vi.mocked(healthAdvancedService.getDocument).mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }));
    const loadingView = renderWithIntl(<HealthDocumentDetailView petId="pet-1" documentId="doc-1" />, locale);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(loading);
    resolveInitial(doc);
    await screen.findByRole("heading", { name: "Blood test" });
    loadingView.unmount();

    vi.mocked(healthAdvancedService.getDocument).mockRejectedValueOnce(new Error("unavailable"));
    vi.mocked(healthAdvancedService.getDocument).mockResolvedValueOnce(doc);
    const failedView = renderWithIntl(<HealthDocumentDetailView petId="pet-1" documentId="doc-1" />, locale);
    await screen.findByText(unavailable);
    expect(screen.getByRole("button", { name: retry })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: retry }));
    await screen.findByRole("heading", { name: "Blood test" });
    expect(healthAdvancedService.getDocument).toHaveBeenCalledTimes(3);
    if (locale === "de" || locale === "es") expect(failedView.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Sicher anzeigen und herunterladen", "Datei öffnen", "Auf die Datei kann nicht zugegriffen werden."],
    ["es", "Vista previa y descarga segura", "Abrir archivo", "No se pudo acceder al archivo."],
  ] as const)("localizes secure preview and download failure in %s", async (locale, previewLabel, openFile, downloadFailed) => {
    vi.mocked(healthAdvancedService.getDocument).mockResolvedValue(doc);
    vi.mocked(healthAdvancedService.downloadDocument).mockRejectedValueOnce(new Error("download failed"));
    const view = renderWithIntl(<HealthDocumentDetailView petId="pet-1" documentId="doc-1" />, locale);
    await screen.findByRole("heading", { name: "Blood test" });
    fireEvent.click(screen.getByRole("button", { name: previewLabel }));
    expect((await screen.findByRole("alert")).textContent).toContain(downloadFailed);
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);

    vi.mocked(healthAdvancedService.downloadDocument).mockResolvedValueOnce({ downloadUrl: "https://signed.example/doc?sig=once", expiresInSeconds: 30 } as never);
    fireEvent.click(screen.getByRole("button", { name: previewLabel }));
    expect(await screen.findByRole("link", { name: openFile })).toBeTruthy();
    expect(screen.getByTitle("Blood test").getAttribute("src")).toContain("signed.example/doc");
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Korrektur des Eintrags anfragen", "Begründung", "Die Korrekturanfrage wurde erfasst. Der ursprüngliche Eintrag bleibt erhalten."],
    ["es", "Solicitar una corrección del registro", "Motivo", "La solicitud de corrección quedó registrada. Se conserva el registro original."],
  ] as const)("localizes provider-authored record correction in %s", async (locale, title, reasonLabel, saved) => {
    vi.mocked(healthAdvancedService.getDocument).mockResolvedValue(doc);
    vi.mocked(usePetAccess).mockReturnValue({ access: { canEditHealth: true } } as never);
    vi.mocked(healthAdvancedService.createCorrection).mockResolvedValue({} as never);
    const view = renderWithIntl(<HealthDocumentDetailView petId="pet-1" documentId="doc-1" />, locale);
    await screen.findByRole("heading", { name: "Blood test" });
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(reasonLabel), { target: { value: "Please correct the recorded value" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Änderungen speichern" : "Guardar cambios" }));
    expect((await screen.findByRole("status")).textContent).toContain(saved);
    expect(healthAdvancedService.createCorrection).toHaveBeenCalledWith("pet-1", expect.objectContaining({ targetType: "MEDICAL_DOCUMENT", targetId: "doc-1" }));
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
