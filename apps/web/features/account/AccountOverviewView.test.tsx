import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { accountService } from "@/services/account.service";
import { householdsService } from "@/services/households.service";
import { AccountOverviewView, accountOverviewCopy } from "./AccountOverviewView";

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
    expect((await screen.findByRole("status")).textContent).toContain("No se pudieron cargar las invitaciones del hogar.");
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
});
