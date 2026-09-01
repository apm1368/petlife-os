import { Injectable } from "@nestjs/common";
import { HomeActionKind, PetInterest, SetupStatus, VaccinationStatus, type HomeActionDto } from "@petlife/types";

/** canViewHealth-gated. When visible is false, vaccinationStatus/profileStatus must not be trusted — nothing is queried for them. */
export interface HomeRankingHealthInput {
  visible: boolean;
  vaccinationStatus: VaccinationStatus;
  profileStatus: SetupStatus;
}

/** canViewCareProfile-gated, same visibility contract as HomeRankingHealthInput. */
export interface HomeRankingCareInput {
  visible: boolean;
  profileStatus: SetupStatus;
}

/**
 * Not permission-gated the way health/care are — a booking is either
 * scoped to the caller's own household or it isn't visible at all (see
 * HomeService), so there's no separate "visible" flag to trust here.
 */
export interface HomeRankingBookingInput {
  hasUpcoming: boolean;
  bookingId: string | null;
}

export interface HomeRankingInput {
  hasActivePet: boolean;
  /** The active pet's real ID, used to build concrete hrefs — null iff hasActivePet is false. */
  activePetId: string | null;
  interests: PetInterest[];
  health: HomeRankingHealthInput;
  care: HomeRankingCareInput;
  booking: HomeRankingBookingInput;
}

/**
 * Deterministic MVP ranking — no ML. Kept as its own service (no DB access:
 * building a URL from an already-known ID is not a query) so the rule set
 * can be swapped for a real model later without touching HomeService's
 * data-fetching. HomeService is responsible for never passing health/care
 * data the caller lacks permission to see: this service trusts `visible`
 * completely and never second-guesses it.
 *
 * Priority order: vaccination due/overdue > health setup incomplete >
 * upcoming Vet booking > (fallback) VET interest or Ask AI, with a
 * care-profile-incomplete secondary action folded in only once none of the
 * above fired. An ordinary upcoming booking deliberately never outranks a
 * vaccination-due or health-incomplete signal — there is no
 * emergency/critical-health severity logic yet (see HealthSeverity), so a
 * routine appointment is never treated as more urgent than either.
 */
@Injectable()
export class HomeRankingService {
  rank(input: HomeRankingInput): { primaryAction: HomeActionDto; secondaryActions: HomeActionDto[] } {
    if (!input.hasActivePet || !input.activePetId) {
      return {
        primaryAction: { kind: HomeActionKind.VIEW_PROFILE, labelKey: "home.action.addPet", href: "/pets/new" },
        secondaryActions: [],
      };
    }

    const petId = input.activePetId;
    const viewProfile: HomeActionDto = { kind: HomeActionKind.VIEW_PROFILE, labelKey: "home.action.viewProfile", href: `/pets/${petId}` };

    if (input.health.visible) {
      if (input.health.vaccinationStatus === VaccinationStatus.DUE_SOON || input.health.vaccinationStatus === VaccinationStatus.OVERDUE) {
        return {
          primaryAction: {
            kind: HomeActionKind.VIEW_VACCINATION,
            labelKey: "home.action.viewVaccination",
            href: `/pets/${petId}/health/vaccination`,
          },
          secondaryActions: [viewProfile],
        };
      }

      if (input.health.profileStatus !== SetupStatus.COMPLETE) {
        return {
          primaryAction: {
            kind: HomeActionKind.COMPLETE_HEALTH,
            labelKey: "home.action.completeHealth",
            href: `/pets/${petId}/health`,
          },
          secondaryActions: [viewProfile],
        };
      }
    }

    if (input.booking.hasUpcoming && input.booking.bookingId) {
      return {
        primaryAction: {
          kind: HomeActionKind.VIEW_BOOKING,
          labelKey: "home.action.viewBooking",
          href: `/bookings/${input.booking.bookingId}`,
        },
        secondaryActions: [viewProfile],
      };
    }

    // Care leads the secondary list (not just appended) so a single-secondary-action
    // consumer like Home still surfaces it instead of always showing "view profile".
    const secondaryActions: HomeActionDto[] = [];
    if (input.care.visible && input.care.profileStatus !== SetupStatus.COMPLETE && input.interests.includes(PetInterest.DAILY_CARE)) {
      secondaryActions.push({
        kind: HomeActionKind.COMPLETE_CARE_PROFILE,
        labelKey: "home.action.completeCareProfile",
        href: `/pets/${petId}/care`,
      });
    }
    secondaryActions.push(viewProfile);

    if (input.interests.includes(PetInterest.VET)) {
      return {
        primaryAction: { kind: HomeActionKind.FIND_VET, labelKey: "home.action.findVet", href: "/vet/find" },
        secondaryActions,
      };
    }

    return {
      primaryAction: { kind: HomeActionKind.ASK_AI, labelKey: "home.action.askAi", href: "/ai" },
      secondaryActions,
    };
  }
}
