import { HomeActionKind, PetInterest, SetupStatus, VaccinationStatus } from "@petlife/types";
import { HomeRankingService, type HomeRankingCareInput, type HomeRankingHealthInput } from "./home-ranking.service";

const HEALTH_HIDDEN: HomeRankingHealthInput = {
  visible: false,
  vaccinationStatus: VaccinationStatus.INCOMPLETE,
  profileStatus: SetupStatus.NOT_STARTED,
};
const HEALTH_COMPLETE: HomeRankingHealthInput = {
  visible: true,
  vaccinationStatus: VaccinationStatus.UP_TO_DATE,
  profileStatus: SetupStatus.COMPLETE,
};
const CARE_HIDDEN: HomeRankingCareInput = { visible: false, profileStatus: SetupStatus.NOT_STARTED };
const CARE_COMPLETE: HomeRankingCareInput = { visible: true, profileStatus: SetupStatus.COMPLETE };

describe("HomeRankingService", () => {
  const ranking = new HomeRankingService();

  it("suggests adding a pet when there is no active pet", () => {
    const result = ranking.rank({
      hasActivePet: false,
      activePetId: null,
      interests: [],
      health: HEALTH_HIDDEN,
      care: CARE_HIDDEN,
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.VIEW_PROFILE);
    expect(result.secondaryActions).toHaveLength(0);
  });

  it("prioritizes viewing vaccination when it is due soon", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.VET],
      health: { visible: true, vaccinationStatus: VaccinationStatus.DUE_SOON, profileStatus: SetupStatus.COMPLETE },
      care: CARE_HIDDEN,
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.VIEW_VACCINATION);
    expect(result.primaryAction.href).toBe("/pets/pet-1/health/vaccination");
  });

  it("prioritizes completing health basics over a due vaccination check when the profile is otherwise incomplete", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.VET],
      health: { visible: true, vaccinationStatus: VaccinationStatus.UP_TO_DATE, profileStatus: SetupStatus.PARTIAL },
      care: CARE_HIDDEN,
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.COMPLETE_HEALTH);
  });

  it("never surfaces health-based actions when health is not visible to the caller", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.VET],
      health: { visible: false, vaccinationStatus: VaccinationStatus.OVERDUE, profileStatus: SetupStatus.NOT_STARTED },
      care: CARE_HIDDEN,
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.FIND_VET);
  });

  it("suggests finding a vet when health is complete and VET is an interest", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.VET],
      health: HEALTH_COMPLETE,
      care: CARE_HIDDEN,
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.FIND_VET);
  });

  it("falls back to Ask AI when health is complete and there is no matching interest", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.SHOPPING],
      health: HEALTH_COMPLETE,
      care: CARE_HIDDEN,
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.ASK_AI);
  });

  it("adds a secondary complete-care-profile action when care is incomplete and DAILY_CARE is an interest", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.DAILY_CARE],
      health: HEALTH_COMPLETE,
      care: { visible: true, profileStatus: SetupStatus.PARTIAL },
    });
    expect(result.secondaryActions.some((a) => a.kind === HomeActionKind.COMPLETE_CARE_PROFILE)).toBe(true);
  });

  it("does not add a care-profile secondary action when care is not visible", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.DAILY_CARE],
      health: HEALTH_COMPLETE,
      care: CARE_HIDDEN,
    });
    expect(result.secondaryActions.some((a) => a.kind === HomeActionKind.COMPLETE_CARE_PROFILE)).toBe(false);
  });

  it("does not add a care-profile secondary action when care is complete", () => {
    const result = ranking.rank({
      hasActivePet: true,
      activePetId: "pet-1",
      interests: [PetInterest.DAILY_CARE],
      health: HEALTH_COMPLETE,
      care: CARE_COMPLETE,
    });
    expect(result.secondaryActions.some((a) => a.kind === HomeActionKind.COMPLETE_CARE_PROFILE)).toBe(false);
  });
});
