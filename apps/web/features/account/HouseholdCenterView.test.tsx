import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { householdsService } from "@/services/households.service";
import type { HouseholdCollaborationDto } from "@/services/account.service";
import { HouseholdCenterView } from "./HouseholdCenterView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
let currentUserId = "u-owner";
vi.mock("@/stores/session-store", () => ({ useSessionStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: currentUserId } }) }));
vi.mock("@/services/households.service", () => ({
  householdsService: { listMine: vi.fn(), collaboration: vi.fn(), removeMember: vi.fn(), changeMemberRole: vi.fn(), leave: vi.fn(), invite: vi.fn(), resendInvitation: vi.fn(), cancelInvitation: vi.fn() },
}));

const household = (overrides: Partial<HouseholdCollaborationDto> = {}): HouseholdCollaborationDto =>
  ({
    id: "h1",
    name: "Home",
    currentUserRole: "OWNER",
    members: [
      { id: "m-owner", userId: "u-owner", role: "OWNER", createdAt: "2026-01-01T00:00:00.000Z", user: { id: "u-owner", displayName: "Sara", avatarUrl: null } },
      { id: "m-family", userId: "u-family", role: "FAMILY", createdAt: "2026-02-01T00:00:00.000Z", user: { id: "u-family", displayName: "Reza", avatarUrl: null } },
    ],
    pets: [{ id: "p1", name: "Cookie", photoUrl: null, species: "DOG", lifecycleStatus: "ACTIVE" }],
    invitations: [],
    grants: [{ id: "g1", petId: "p1", userId: "u-family", source: "TEMPORARY", startsAt: null, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), createdAt: "2026-02-01T00:00:00.000Z" } as never],
    history: [{ id: "e1", type: "HouseholdMemberRoleChanged", occurredAt: "2026-02-02T00:00:00.000Z" }],
    ...overrides,
  }) as HouseholdCollaborationDto;

describe("HouseholdCenterView", () => {
  beforeEach(() => {
    currentUserId = "u-owner";
    vi.mocked(householdsService.listMine).mockReset().mockResolvedValue([{ id: "h1", name: "Home" } as never]);
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
});
