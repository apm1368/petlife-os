import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PetLifecycleStatus, PetSpecies, type AdminPet360Dto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminPetsService } from "@/services/admin-pets.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminPetDetailView, AdminPetsView } from "./AdminPetsViews";

vi.mock("@/services/admin-pets.service", () => ({ adminPetsService: { list: vi.fn(), get: vi.fn(), revokeGrant: vi.fn() } }));

function signIn(permissions: string[]) {
  useAdminStore.setState({ context: { permissions } as never });
}

const pet360: AdminPet360Dto = {
  identity: { id: "p1", name: "Cookie", species: PetSpecies.DOG, breed: "Golden", sex: "FEMALE", birthDate: null, approximateAgeMonths: 30, neuteredStatus: "NEUTERED", microchipMasked: "982***123", lifecycleStatus: PetLifecycleStatus.ACTIVE, deletedAt: null, createdAt: "2026-01-01T00:00:00.000Z", hasPhoto: true },
  household: {
    id: "h1",
    name: "Rahimi",
    city: "Tehran",
    members: [
      { userId: "u-owner", displayName: "Sara", role: "OWNER", accountStatus: "ACTIVE" },
      { userId: "u-kid", displayName: "Arman", role: "FAMILY", accountStatus: "ACTIVE" },
    ],
    pendingInvitations: [],
  },
  accessGrants: [
    { id: "g1", user: { id: "u-owner", displayName: "Sara" }, source: "HOUSEHOLD", reason: null, flags: { canViewIdentity: true }, healthScopes: [], startsAt: null, expiresAt: null, revokedAt: null, active: true, grantedByUserId: null, isHouseholdMember: true, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "g2", user: { id: "u-sitter", displayName: "Nima" }, source: "TEMPORARY", reason: null, flags: { canViewIdentity: true, canBookCare: true }, healthScopes: [], startsAt: null, expiresAt: null, revokedAt: null, active: true, grantedByUserId: "u-owner", isHouseholdMember: false, createdAt: "2026-02-01T00:00:00.000Z" },
  ],
  health: { documents: 2, documentsByType: [], clinicalVisits: 1, labResults: 0, medications: {}, conditions: 0, allergies: 1 },
  bookings: [{ id: "b1", category: "GROOMING", bookingStatus: "COMPLETED", startAt: "2026-03-01T08:00:00.000Z", providerOrganizationId: null }],
  lostIncidents: [],
  care: { reminders: { UPCOMING: 2 } },
  travel: [],
  insurance: { applications: {}, claimPreps: 0 },
  sharing: { activeShareCards: 1, activeHealthShares: 0 },
  activity: [],
  diagnostics: [],
};

describe("Admin pets", () => {
  beforeEach(() => {
    vi.mocked(adminPetsService.list).mockReset();
    vi.mocked(adminPetsService.get).mockReset();
  });

  it("lists each pet with its owner and how many other household members it has", async () => {
    signIn(["customer.view"]);
    vi.mocked(adminPetsService.list).mockResolvedValue({
      items: [{ id: "p1", name: "Cookie", species: PetSpecies.DOG, breed: "Golden", lifecycleStatus: PetLifecycleStatus.ACTIVE, deleted: false, hasPhoto: true, household: { id: "h1", name: "Rahimi" }, owner: { userId: "u-owner", displayName: "Sara" }, familyMemberCount: 1, createdAt: "2026-01-01T00:00:00.000Z" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderWithIntl(<AdminPetsView />, "en");
    expect(await screen.findByText("Cookie")).toBeTruthy();
    expect(screen.getByText("Sara")).toBeTruthy();
    expect(screen.getByText("Dog · Golden")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/en/admin/pets/p1");
  });

  it("shows the owner and the other household members separately, and never offers to revoke the owner", async () => {
    signIn(["customer.view", "pet.access.manage"]);
    vi.mocked(adminPetsService.get).mockResolvedValue(pet360);
    renderWithIntl(<AdminPetDetailView petId="p1" />, "en");
    expect(await screen.findByRole("heading", { name: "Cookie" })).toBeTruthy();
    const owner = screen.getByRole("heading", { name: "Owner" }).closest("section")!;
    expect(owner.textContent).toContain("Sara");
    expect(owner.textContent).not.toContain("Arman");
    const family = screen.getByRole("heading", { name: "Household members" }).closest("section")!;
    expect(family.textContent).toContain("Arman");
    expect(family.textContent).not.toContain("Sara");
    // Only the sitter's grant can be revoked here.
    expect(screen.getAllByRole("button", { name: "Revoke access" })).toHaveLength(1);
    expect(screen.getByText(/Grooming/)).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("renders in Persian", async () => {
    signIn(["customer.view"]);
    vi.mocked(adminPetsService.get).mockResolvedValue(pet360);
    renderWithIntl(<AdminPetDetailView petId="p1" />, "fa");
    expect(await screen.findByRole("heading", { name: "صاحب حیوان" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "اعضای خانواده" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "لغو دسترسی" })).toBeNull();
  });
});
