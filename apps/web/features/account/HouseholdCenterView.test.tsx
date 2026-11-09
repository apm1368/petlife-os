import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import type { HouseholdCollaborationDto } from "@/services/account.service";
import { HouseholdCenterView } from "./HouseholdCenterView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
let currentUserId = "u-owner";
vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: currentUserId } }),
}));
vi.mock("@/services/households.service", () => ({
  householdsService: {
    listMine: vi.fn(),
    collaboration: vi.fn(),
    removeMember: vi.fn(),
    changeMemberRole: vi.fn(),
    leave: vi.fn(),
    invite: vi.fn(),
    resendInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    approveMembershipRequest: vi.fn(),
    rejectMembershipRequest: vi.fn(),
  },
}));

const household = (overrides: Partial<HouseholdCollaborationDto> = {}): HouseholdCollaborationDto =>
  ({
    id: "h1",
    name: "Home",
    currentUserRole: "OWNER",
    members: [
      {
        id: "m-owner",
        userId: "u-owner",
        role: "OWNER",
        createdAt: "2026-01-01T00:00:00.000Z",
        user: { id: "u-owner", displayName: "Sara", avatarUrl: null },
      },
      {
        id: "m-family",
        userId: "u-family",
        role: "FAMILY",
        createdAt: "2026-02-01T00:00:00.000Z",
        user: { id: "u-family", displayName: "Reza", avatarUrl: null },
      },
    ],
    pets: [{ id: "p1", name: "Cookie", photoUrl: null, species: "DOG", lifecycleStatus: "ACTIVE" }],
    invitations: [],
    grants: [
      {
        id: "g1",
        petId: "p1",
        userId: "u-family",
        source: "TEMPORARY",
        startsAt: null,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        createdAt: "2026-02-01T00:00:00.000Z",
      } as never,
    ],
    history: [{ id: "e1", type: "HouseholdMemberRoleChanged", occurredAt: "2026-02-02T00:00:00.000Z" }],
    ...overrides,
  }) as HouseholdCollaborationDto;

describe("HouseholdCenterView", () => {
  beforeEach(() => {
    currentUserId = "u-owner";
    vi.mocked(householdsService.listMine)
      .mockReset()
      .mockResolvedValue([{ id: "h1", name: "Home" } as never]);
    vi.mocked(householdsService.collaboration).mockReset().mockResolvedValue(household());
    vi.mocked(householdsService.removeMember).mockReset().mockResolvedValue({ ok: true });
  });

  it("shows each member's role and pet access, and lets the owner remove a member only after confirming the consequences", async () => {
    renderWithIntl(<HouseholdCenterView />, "en");
    await screen.findByText("Reza");
    expect(screen.getByText(/Access to Cookie · 1 temporary/)).toBeTruthy();
    expect(screen.getByText("A member's role changed")).toBeTruthy();
    // The sole owner is told why they can't leave yet.
    expect(screen.getByText(/You're the only owner/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText(/access to this household's pets ends immediately/)).toBeTruthy();
    expect(householdsService.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await waitFor(() => expect(householdsService.removeMember).toHaveBeenCalledWith("h1", "m-family"));
  });

  it("a family member sees no management actions, only the option to leave", async () => {
    currentUserId = "u-family";
    vi.mocked(householdsService.collaboration).mockResolvedValue(household({ currentUserRole: "FAMILY" }));
    renderWithIntl(<HouseholdCenterView />, "fa");
    await screen.findByText("Reza");
    expect(screen.queryByRole("button", { name: "حذف" })).toBeNull();
    expect(screen.queryByRole("button", { name: "دعوت عضو" })).toBeNull();
    expect(screen.queryByRole("button", { name: "مدیریت دسترسی" })).toBeNull();
    expect(screen.getByRole("button", { name: "ترک این خانواده" })).toBeTruthy();
  });

  it("clears the previous household's details while another household is loading", async () => {
    let resolveOtherHousehold: ((value: HouseholdCollaborationDto) => void) | undefined;
    vi.mocked(householdsService.listMine).mockResolvedValue([
      { id: "h1", name: "Home" },
      { id: "h2", name: "Other home" },
    ] as never);
    vi.mocked(householdsService.collaboration)
      .mockResolvedValueOnce(household())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOtherHousehold = resolve;
          }),
      );

    renderWithIntl(<HouseholdCenterView />, "en");
    await screen.findByText("Reza");
    fireEvent.change(screen.getByLabelText("Household"), { target: { value: "h2" } });

    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("Reza")).toBeNull();
    expect(screen.queryByText("Cookie")).toBeNull();

    resolveOtherHousehold?.(
      household({
        id: "h2",
        name: "Other home",
        members: [
          {
            id: "m-owner-2",
            userId: "u-owner",
            role: "OWNER",
            createdAt: "2026-01-01T00:00:00.000Z",
            user: { id: "u-owner", displayName: "Sara", avatarUrl: null },
          },
        ],
        pets: [{ id: "p2", name: "Milo", photoUrl: null, species: "CAT", lifecycleStatus: "ACTIVE" }],
        grants: [],
        history: [],
      }),
    );

    expect(await screen.findAllByText("Milo")).toHaveLength(2);
    expect(screen.queryByText("Cookie")).toBeNull();
  });

  it.each([
    ["de", "Mitglieder", "Zugriffsverlauf", "Pflegehilfe"],
    ["es", "Miembros", "Historial de acceso", "Ayudante de cuidados"],
  ] as const)(
    "renders household and access copy in %s",
    async (locale, membersHeading, historyHeading, presetLabel) => {
      renderWithIntl(<HouseholdCenterView />, locale);
      await screen.findByText("Reza");
      expect(screen.getByRole("heading", { name: membersHeading })).toBeTruthy();
      expect(screen.getByRole("heading", { name: historyHeading })).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: locale === "de" ? "Mitglied einladen" : "Invitar a un miembro" }),
      );
      expect(await screen.findByRole("option", { name: presetLabel })).toBeTruthy();
      expect(
        screen.getByText(locale === "de" ? "Mitgliedsrolle geändert" : "Rol de un miembro modificado"),
      ).toBeTruthy();
    },
  );

  it("invites by mobile, sets pet-scoped access and clearly says no SMS is sent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(householdsService.invite).mockResolvedValue({
      id: "invite-1",
      delivery: "LINK_ONLY",
      sharePath: "/invitations/secret-token",
    } as never);
    renderWithIntl(<HouseholdCenterView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Invite member" }));
    const phone = screen.getByLabelText("Family member's mobile number");
    fireEvent.change(phone, { target: { value: "0912 345 6789" } });
    expect(screen.getByText(/No verification SMS or email is sent/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save invitation" }));
    await waitFor(() =>
      expect(householdsService.invite).toHaveBeenCalledWith("h1", {
        contact: "+989123456789",
        initialAccess: [{ petId: "p1", preset: "VIEW_ONLY" }],
      }),
    );
    expect(await screen.findByText(/The invitation is saved\. Share the link directly/i)).toBeTruthy();
    const inviteLink = await screen.findByLabelText("Invitation link");
    expect((inviteLink as HTMLInputElement).value).toMatch(
      /^http:\/\/localhost(?::\d+)?\/en\/invitations\/secret-token$/,
    );
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toContain("wa.me");
    expect(screen.getByRole("link", { name: "Telegram" }).getAttribute("href")).toContain("t.me/share/url");
    expect(screen.getByRole("link", { name: "Bale" }).getAttribute("href")).toContain("ble.ir/share/url");
    expect(screen.getByRole("link", { name: "SMS" }).getAttribute("href")).toContain("sms:?body=");
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith((inviteLink as HTMLInputElement).value));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it.each([
    ["de", "Zugriffsereignis"],
    ["es", "Evento de acceso"],
  ] as const)("uses a localized safe label for unknown history codes in %s", async (locale, safeLabel) => {
    vi.mocked(householdsService.collaboration).mockResolvedValue(
      household({
        history: [{ id: "unknown", type: "BACKEND_EVENT_CODE", occurredAt: "2026-02-03T10:00:00.000Z" }],
      }),
    );
    renderWithIntl(<HouseholdCenterView />, locale);
    await screen.findByText("Reza");
    expect(screen.getByText(safeLabel)).toBeTruthy();
    expect(screen.queryByText("BACKEND_EVENT_CODE")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    [
      "de",
      "Mitglied einladen",
      "Mobilnummer des Familienmitglieds",
      "Einladung speichern",
      "Die Einladung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
    ],
    [
      "es",
      "Invitar a un miembro",
      "Número de móvil del familiar",
      "Guardar invitación",
      "No se pudo enviar la invitación. Inténtalo de nuevo.",
    ],
  ] as const)(
    "keeps invitation failure copy in %s instead of showing server text",
    async (locale, openLabel, phoneLabel, saveLabel, expected) => {
      vi.mocked(householdsService.invite).mockRejectedValueOnce(
        new ApiError({ code: "UNKNOWN_INVITE_FAILURE", message: "خطای فارسی سرور", requestId: "test" }, 500),
      );
      renderWithIntl(<HouseholdCenterView />, locale);
      fireEvent.click(await screen.findByRole("button", { name: openLabel }));
      fireEvent.change(screen.getByLabelText(phoneLabel), { target: { value: "0912 345 6789" } });
      fireEvent.click(screen.getByRole("button", { name: saveLabel }));
      expect((await screen.findByRole("alert")).textContent).toContain(expected);
      expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
    },
  );

  it("localizes a failed membership approval without exposing the API message", async () => {
    vi.mocked(householdsService.collaboration).mockResolvedValue(
      household({
        invitations: [
          {
            id: "request-1",
            contactMasked: "+98••••5678",
            status: "REQUESTED",
            expiresAt: "2026-02-10T10:00:00.000Z",
            createdAt: "2026-02-01T10:00:00.000Z",
            requestedAt: "2026-02-02T10:00:00.000Z",
            initialAccess: [],
            requester: {
              id: "u-new",
              displayName: "Noor",
              avatarUrl: null,
              phoneMasked: "+98••••5678",
              phoneVerified: false,
            },
          },
        ],
      }),
    );
    vi.mocked(householdsService.approveMembershipRequest).mockRejectedValueOnce(
      new ApiError({ code: "UNKNOWN_APPROVAL_FAILURE", message: "خطای فارسی سرور", requestId: "test" }, 500),
    );
    renderWithIntl(<HouseholdCenterView />, "es");
    await screen.findByText("Noor");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar adhesión" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "No se pudo completar. Inténtalo de nuevo.",
    );
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
