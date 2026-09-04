import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { SetupStatus, type CareProfileDto, type PetAccessFlags } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { careProfileService } from "@/services/care-profile.service";
import { petsService } from "@/services/pets.service";
import { CareProfileView } from "./CareProfileView";

vi.mock("@/services/care-profile.service", () => ({ careProfileService: { get: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getMyAccess: vi.fn() } }));

const FULL_ACCESS: PetAccessFlags = {
  canViewIdentity: true,
  canEditIdentity: true,
  canViewHealth: true,
  canEditHealth: true,
  canBookCare: true,
  canViewCareProfile: true,
  canEditCareProfile: true,
  canViewLocation: true,
  canManageAccess: true,
  canRecordClinicalData: false,
};

const PROFILE: CareProfileDto = {
  petId: "pet-1",
  status: SetupStatus.PARTIAL,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  temperamentText: "Calm and friendly",
  aroundPeopleText: null,
  aroundAnimalsText: null,
  leashBehaviorText: null,
  handlingSensitivityText: null,
  feedingRoutineText: null,
  toiletRoutineText: null,
  separationBehaviorText: null,
  specialInstructionsText: null,
};

describe("CareProfileView", () => {
  beforeEach(() => {
    vi.mocked(careProfileService.get).mockReset();
    vi.mocked(petsService.getMyAccess).mockReset();
  });

  it("shows an edit action and no read-only notice when the caller can edit", async () => {
    vi.mocked(careProfileService.get).mockResolvedValue(PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue(FULL_ACCESS);

    renderWithIntl(<CareProfileView petId="pet-1" />);

    expect(await screen.findByRole("button", { name: "Edit Care Profile" })).toBeTruthy();
    expect(screen.queryByText(/read-only/i)).toBeNull();
  });

  it("never shows the edit form or an edit action to a view-only caller", async () => {
    vi.mocked(careProfileService.get).mockResolvedValue(PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ ...FULL_ACCESS, canEditCareProfile: false });

    renderWithIntl(<CareProfileView petId="pet-1" />);

    await screen.findByText("Calm and friendly");
    expect(screen.queryByRole("button", { name: "Edit Care Profile" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
