import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { accountService, type PrivacyCenterDto } from "@/services/account.service";
import { PrivacyCenterView } from "./PrivacyCenterView";

vi.mock("@/services/account.service", () => ({
  accountService: { privacy: vi.fn(), sharing: vi.fn(), consentHistory: vi.fn(), setConsent: vi.fn(), requestExport: vi.fn(), downloadExport: vi.fn(), deletionPreview: vi.fn(), sendDeletionCode: vi.fn(), requestDeletion: vi.fn(), cancelDeletion: vi.fn() },
}));

const privacy = (overrides: Partial<PrivacyCenterDto> = {}): PrivacyCenterDto => ({
  consentVersion: "2026-09-25",
  consents: [
    { kind: "TERMS", required: true, currentVersion: "2026-09-25", granted: true, grantedAt: "2026-09-26T00:00:00.000Z", revokedAt: null, lastRecordedVersion: "2026-09-25" },
    { kind: "PRIVACY", required: true, currentVersion: "2026-09-25", granted: false, grantedAt: null, revokedAt: null, lastRecordedVersion: null },
    { kind: "MARKETING", required: false, currentVersion: "2026-09-25", granted: false, grantedAt: null, revokedAt: null, lastRecordedVersion: null },
  ],
  exports: [{ id: "x1", status: "READY", requestedAt: "2026-09-29T00:00:00.000Z", readyAt: "2026-09-29T00:01:00.000Z", expiresAt: "2026-10-06T00:01:00.000Z", fileSizeBytes: 20480, downloadCount: 0, failureCode: null }],
  exportAvailableDays: 7,
  exportIncludes: ["ACCOUNT", "PETS"],
  deletionRequests: [],
  retention: { policyPublished: false },
  ...overrides,
});

describe("PrivacyCenterView", () => {
  beforeEach(() => {
    vi.mocked(accountService.privacy).mockReset().mockResolvedValue(privacy());
    vi.mocked(accountService.sharing).mockReset().mockResolvedValue({ sharedByYou: [{ grantId: "g1", pet: { id: "p1", name: "Cookie" }, person: "Reza", kind: "TEMPORARY", canViewHealth: true, startsAt: null, expiresAt: null }], sharedWithYou: [] });
    vi.mocked(accountService.consentHistory).mockReset().mockResolvedValue({ currentVersion: "2026-09-25", items: [{ kind: "TERMS", version: "2026-09-25", acceptedAt: "2026-09-26T00:00:00.000Z", withdrawnAt: null, source: "PRIVACY_CENTER" }] });
    vi.mocked(accountService.setConsent).mockReset().mockResolvedValue({});
    vi.mocked(accountService.deletionPreview).mockReset();
  });

  it("shows required agreements, a real marketing switch, who can see the pets, and ready exports", async () => {
    renderWithIntl(<PrivacyCenterView />, "en");
    expect(await screen.findByText("Cookie — with Reza")).toBeTruthy();
    expect(screen.getByText(/Temporary access · sees health/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept current version" })).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Offers & marketing messages" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(accountService.setConsent).toHaveBeenCalledWith("MARKETING", true));
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
    expect(screen.getByText(/20 KB/)).toBeTruthy();
  });

  it("deletion shows the consequences and won't continue while obligations are open", async () => {
    vi.mocked(accountService.deletionPreview).mockResolvedValue({ households: [{ id: "h1", name: "Home", role: "OWNER", otherMembers: 1, pets: 2, membershipStatus: null, onlyOwnerWithOthers: true }], blockers: [{ code: "ONLY_OWNER_OF_SHARED_HOUSEHOLD", count: 1 }], canRequest: false, reauth: { password: false, code: "sa***@example.com" }, retention: { policyPublished: false } });
    renderWithIntl(<PrivacyCenterView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Request account deletion" }));
    expect(await screen.findByText(/You're the only owner of a household others share/)).toBeTruthy();
    expect(screen.getByText(/Data-retention rules/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a pending deletion request can be cancelled (Persian)", async () => {
    vi.mocked(accountService.privacy).mockResolvedValue(privacy({ deletionRequests: [{ id: "d1", status: "PENDING", requestedAt: "2026-09-29T00:00:00.000Z", cancelledAt: null, completedAt: null }] }));
    renderWithIntl(<PrivacyCenterView />, "fa");
    expect(await screen.findByRole("button", { name: "لغو درخواست حذف" })).toBeTruthy();
  });

  it.each([
    ["de", "DATENSCHUTZ", "Einwilligungsverlauf", "Verlauf anzeigen", "Kopie Ihrer Daten erhalten"],
    ["es", "CENTRO DE PRIVACIDAD", "Historial de consentimientos", "Mostrar historial", "Obtener una copia de tus datos"],
  ] as const)("renders privacy, export and consent-history UI in %s without Persian fallback", async (locale, eyebrow, historyTitle, historyOpen, exportTitle) => {
    renderWithIntl(<PrivacyCenterView />, locale);
    expect(await screen.findByText(locale === "de" ? "Cookie — geteilt mit Reza" : "Cookie — compartido con Reza")).toBeTruthy();
    expect(screen.getByText(eyebrow)).toBeTruthy();
    expect(screen.getByRole("heading", { name: exportTitle })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
    expect(document.body.textContent).not.toContain("[Missing");

    fireEvent.click(screen.getByRole("button", { name: historyOpen }));
    expect(await screen.findByRole("heading", { name: historyTitle })).toBeTruthy();
    expect((await screen.findAllByText(locale === "de" ? /Angenommen am/ : /Aceptado el/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
    expect(document.body.textContent).not.toContain("[Missing");
  });

  it.each([
    ["de", "Kontolöschung beantragen", "Weiter", "Geben Sie DELETE zur Bestätigung ein"],
    ["es", "Solicitar la eliminación de la cuenta", "Continuar", "Escribe DELETE para confirmar"],
  ] as const)("localizes the account-deletion impact and identity dialog in %s", async (locale, requestLabel, continueLabel, typedLabel) => {
    vi.mocked(accountService.deletionPreview).mockResolvedValue({ households: [{ id: "home1", name: "Paws Home", role: "OWNER", otherMembers: 2, pets: 1, membershipStatus: "ACTIVE", onlyOwnerWithOthers: false }], blockers: [], canRequest: true, reauth: { password: true, code: null }, retention: { policyPublished: false } });
    renderWithIntl(<PrivacyCenterView />, locale);
    fireEvent.click(await screen.findByRole("button", { name: requestLabel }));
    expect(await screen.findByText(locale === "de" ? "Welche Auswirkungen dies hat" : "Qué se verá afectado")).toBeTruthy();
    expect(screen.getByText(/Paws Home/)).toBeTruthy();
    expect(screen.getByText(locale === "de" ? /Mitgliedschaft: aktiv/ : /estado de membresía: activa/)).toBeTruthy();
    expect(screen.getByText(locale === "de" ? /Die Regeln zur Datenaufbewahrung/ : /Las reglas de conservación de datos/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: continueLabel }));
    expect(await screen.findByLabelText(typedLabel)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
    expect(document.body.textContent).not.toContain("[Missing");
  });

  it.each([
    ["de", "Wird geladen", "Die Datenschutzinformationen konnten nicht geladen werden."],
    ["es", "Cargando", "No se pudo cargar la información de privacidad."],
  ] as const)("localizes loading and error states in %s", async (locale, loadingLabel, errorMessage) => {
    vi.mocked(accountService.privacy).mockImplementationOnce(() => new Promise(() => undefined));
    vi.mocked(accountService.sharing).mockImplementationOnce(() => new Promise(() => undefined));
    const view = renderWithIntl(<PrivacyCenterView />, locale);
    expect(screen.getByLabelText(loadingLabel)).toBeTruthy();
    view.unmount();

    vi.mocked(accountService.privacy).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<PrivacyCenterView />, locale);
    expect(await screen.findByText(errorMessage)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Derzeit ist nichts für andere freigegeben.", "Keine Einwilligung gespeichert.", "Der Verlauf konnte nicht geladen werden."],
    ["es", "Ahora mismo no compartes acceso con nadie.", "No hay consentimientos registrados.", "No se pudo cargar el historial."],
  ] as const)("localizes empty and failed consent-history states in %s", async (locale, noSharing, noHistory, historyError) => {
    vi.mocked(accountService.sharing).mockResolvedValue({ sharedByYou: [], sharedWithYou: [] });
    vi.mocked(accountService.consentHistory).mockResolvedValueOnce({ currentVersion: "2026-09-25", items: [] });
    renderWithIntl(<PrivacyCenterView />, locale);
    expect(await screen.findByText(noSharing)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Verlauf anzeigen" : "Mostrar historial" }));
    expect(await screen.findByText(noHistory)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);

    vi.mocked(accountService.consentHistory).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Verlauf ausblenden" : "Ocultar historial" }));
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Verlauf anzeigen" : "Mostrar historial" }));
    expect(await screen.findByText(historyError)).toBeTruthy();
  });
});
