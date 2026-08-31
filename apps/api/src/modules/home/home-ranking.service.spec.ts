import { HomeActionKind, PetInterest } from "@petlife/types";
import { HomeRankingService } from "./home-ranking.service";

describe("HomeRankingService", () => {
  const ranking = new HomeRankingService();

  it("suggests adding a pet when there is no active pet", () => {
    const result = ranking.rank({ hasActivePet: false, healthBasicsComplete: false, interests: [] });
    expect(result.primaryAction.kind).toBe(HomeActionKind.VIEW_PROFILE);
    expect(result.secondaryActions).toHaveLength(0);
  });

  it("prioritizes completing health basics over everything else", () => {
    const result = ranking.rank({
      hasActivePet: true,
      healthBasicsComplete: false,
      interests: [PetInterest.VET],
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.COMPLETE_HEALTH);
  });

  it("suggests finding a vet when health is complete and VET is an interest", () => {
    const result = ranking.rank({
      hasActivePet: true,
      healthBasicsComplete: true,
      interests: [PetInterest.VET],
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.FIND_VET);
  });

  it("falls back to Ask AI when health is complete and there is no matching interest", () => {
    const result = ranking.rank({
      hasActivePet: true,
      healthBasicsComplete: true,
      interests: [PetInterest.SHOPPING],
    });
    expect(result.primaryAction.kind).toBe(HomeActionKind.ASK_AI);
  });
});
