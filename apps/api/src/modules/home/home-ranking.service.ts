import { Injectable } from "@nestjs/common";
import { HomeActionKind, PetInterest, type HomeActionDto } from "@petlife/types";

export interface HomeRankingInput {
  hasActivePet: boolean;
  healthBasicsComplete: boolean;
  interests: PetInterest[];
}

/**
 * Deterministic MVP ranking — no ML. Kept as its own service (no DB access)
 * so the rule set can be swapped for a real model later without touching
 * HomeService's data-fetching.
 */
@Injectable()
export class HomeRankingService {
  rank(input: HomeRankingInput): { primaryAction: HomeActionDto; secondaryActions: HomeActionDto[] } {
    if (!input.hasActivePet) {
      return {
        primaryAction: { kind: HomeActionKind.VIEW_PROFILE, labelKey: "home.action.addPet", href: "/pets/new" },
        secondaryActions: [],
      };
    }

    if (!input.healthBasicsComplete) {
      return {
        primaryAction: {
          kind: HomeActionKind.COMPLETE_HEALTH,
          labelKey: "home.action.completeHealth",
          href: "/pets/active/health-setup",
        },
        secondaryActions: [
          { kind: HomeActionKind.VIEW_PROFILE, labelKey: "home.action.viewProfile", href: "/pets/active" },
        ],
      };
    }

    if (input.interests.includes(PetInterest.VET)) {
      return {
        primaryAction: { kind: HomeActionKind.FIND_VET, labelKey: "home.action.findVet", href: "/vet/find" },
        secondaryActions: [
          { kind: HomeActionKind.VIEW_PROFILE, labelKey: "home.action.viewProfile", href: "/pets/active" },
        ],
      };
    }

    return {
      primaryAction: { kind: HomeActionKind.ASK_AI, labelKey: "home.action.askAi", href: "/ai" },
      secondaryActions: [
        { kind: HomeActionKind.VIEW_PROFILE, labelKey: "home.action.viewProfile", href: "/pets/active" },
      ],
    };
  }
}
