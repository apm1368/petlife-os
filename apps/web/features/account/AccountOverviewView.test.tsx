import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { accountService } from "@/services/account.service";
import { householdsService } from "@/services/households.service";
import { AccountOverviewView, accountOverviewCopy } from "./AccountOverviewView";
import { ApiError } from "@/lib/api/client";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/de/profile" }));
vi.mock("@/services/account.service", () => ({ accountService: { overview: vi.fn() } }));
vi.mock("@/services/households.service", () => ({ householdsService: { incomingInvitations: vi.fn(), requestIncomingMembership: vi.fn(), declineIncomingInvitation: vi.fn() } }));

const DATA = {
  user: { id: "u1", displayName: "Ana García", email: "ana@example.test", phone: null, avatarUrl: null, locale: "fa", themePreference: "SYSTEM", createdAt: "2025-01-01T00:00:00Z" },
  households: [{ id: "h1", name: null, role: "OWNER", _count: { members: 2, pets: 1 }, subscription: { status: "ACTIVE", currentPeriod: null } }],
  security: { activeSessions: 3 }, attention: { pendingInvitations: 2 },
};

describe("AccountOverviewView four-locale page copy", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(accountService.overview).mockReset().mockResolvedValue(DATA as never);
    vi.mocked(householdsService.incomingInvitations).mockReset().mockResolvedValue([]);
    vi.mocked(householdsService.requestIncomingMembership).mockReset().mockResolvedValue({ householdId: "h1", invitationId: "i1", status: "REQUESTED", alreadyRequested: false });
    vi.mocked(householdsService.declineIncomingInvitation).mockReset().mockResolvedValue({ ok: true });
  });

  it("has the same application-copy keys in every supported locale", () => {
    const keys = Object.keys(accountOverviewCopy.fa).sort();
    for (const locale of ["en", "de", "es"] as const) expect(Object.keys(accountOverviewCopy[locale]).sort()).toEqual(keys);
  });

  it("has localized invitation loading, empty and recovery copy in every locale", () => {
    const keys = ["invitationsLoading", "noInvitations", "invitationsOffline", "invitationsNoAccess", "loadInvitationsError", "retryInvitations"] as const;
    for (const locale of ["fa", "en", "de", "es"] as const) {
      for (const key of keys) expect(accountOverviewCopy[locale][key].length).toBeGreaterThan(0);
      if (locale === "de" || locale === "es") {
        for (const key of keys) expect(accountOverviewCopy[locale][key]).not.toMatch(/[\u0600-\u06FF]/);
      }
    }
  });

  it.each([
    ["de", "KONTOZENTRUM", "Hallo, Ana García", "Benötigt Aufmerksamkeit", "2 offene Einladungen und 3 aktive Sitzungen."],
    ["es", "CENTRO DE CUENTA", "Hola, Ana García", "Requiere atención", "2 invitaciones pendientes y 3 sesiones activas."],
  ] as const)("translates the account overview in %s", async (locale, eyebrow, greeting, attention, summary) => {
    renderWithIntl(<AccountOverviewView />, locale);
    expect(await screen.findByRole("heading", { name: greeting })).toBeTruthy();
    expect(screen.getByText(eyebrow)).toBeTruthy();
    expect(screen.getByText(attention)).toBeTruthy();
    expect(screen.getByText(summary)).toBeTruthy();
    expect(screen.getByText(locale === "de" ? "Mein Haushalt" : "Mi hogar")).toBeTruthy();
    expect(screen.getByText("Ana García")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/حساب کاربری|دعوت به خانواده|نیازمند توجه|خانواده و دسترسی/);
    expect(screen.getByRole("button", { name: locale === "de" ? "Profil bearbeiten" : "Editar perfil" })).toBeTruthy();
  });

  it("keeps the invitation explicit: a request is not phone verification or immediate access", async () => {
    vi.mocked(householdsService.incomingInvitations).mockResolvedValue([{ id: "i1", inviter: { displayName: "Lena" }, contactMasked: "+49•••1234", expiresAt: "2026-11-15T00:00:00Z", createdAt: "2026-11-01T00:00:00Z" }]);
    renderWithIntl(<AccountOverviewView />, "de");
    expect(await screen.findByText(/Mit Ihrer Anfrage wird Ihre Mobilnummer nicht verifiziert/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mitgliedschaft anfragen" }));
    await waitFor(() => expect(householdsService.requestIncomingMembership).toHaveBeenCalledWith("i1"));
    expect((await screen.findByRole("status")).textContent).toContain("Zugriff wird erst nach Freigabe");
  });

  it("shows an honest empty household state and a localized invitation-load error", async () => {
    vi.mocked(accountService.overview).mockResolvedValue({ ...DATA, households: [] } as never);
    vi.mocked(householdsService.incomingInvitations).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<AccountOverviewView />, "es");
    expect(await screen.findByText("Aún no hay un hogar registrado")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudieron cargar las invitaciones del hogar.");
    expect(document.body.textContent).not.toMatch(/خانواده|دعوت‌های خانواده/);
  });

  it.each([["de", "Wird geladen"], ["es", "Cargando"]] as const)("labels the account loading state in %s", (locale, label) => {
    vi.mocked(accountService.overview).mockImplementation(() => new Promise(() => undefined));
    renderWithIntl(<AccountOverviewView />, locale);
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it.each([["de", "Erneut versuchen"], ["es", "Reintentar"]] as const)("shows a localized retry state after account load failure in %s", async (locale, retry) => {
    vi.mocked(accountService.overview).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<AccountOverviewView />, locale);
    expect(await screen.findByRole("button", { name: retry })).toBeTruthy();
  });

  it.each([["de", "Haushaltseinladungen werden geladen"], ["es", "Cargando invitaciones del hogar"]] as const)("shows an accessible invitation loading state in %s", async (locale, label) => {
    vi.mocked(householdsService.incomingInvitations).mockImplementationOnce(() => new Promise(() => undefined));
    renderWithIntl(<AccountOverviewView />, locale);
    expect(await screen.findByLabelText(label)).toBeTruthy();
  });

  it.each([["de", "Keine Internetverbindung. Stellen Sie die Verbindung wieder her und versuchen Sie es erneut."], ["es", "No hay conexión a internet. Conéctate e inténtalo de nuevo."]] as const)("lets a user retry a recoverable invitation load failure in %s", async (locale, offlineMessage) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.mocked(householdsService.incomingInvitations).mockRejectedValueOnce(new Error("network"));
    renderWithIntl(<AccountOverviewView />, locale);
    expect(await screen.findByText(offlineMessage)).toBeTruthy();
    expect(screen.queryByText("network")).toBeNull();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    vi.mocked(householdsService.incomingInvitations).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: accountOverviewCopy[locale].retryInvitations }));
    expect(await screen.findByText(accountOverviewCopy[locale].noInvitations)).toBeTruthy();
  });

  it.each(["de", "es"] as const)("renders invitation access-denied feedback without exposing the API message in %s", async (locale) => {
    vi.mocked(householdsService.incomingInvitations).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "private authorization detail", requestId: "r1" }, 403));
    renderWithIntl(<AccountOverviewView />, locale);
    expect(await screen.findByText(accountOverviewCopy[locale].invitationsNoAccess)).toBeTruthy();
    expect(screen.queryByText("private authorization detail")).toBeNull();
  });
});
