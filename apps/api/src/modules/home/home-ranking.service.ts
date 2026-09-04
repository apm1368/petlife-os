import { Injectable } from "@nestjs/common";
import { HomeActionKind, PetInterest, ServiceCategory, SetupStatus, VaccinationStatus, type HomeActionDto } from "@petlife/types";

/** Category-aware label so Home says "View upcoming grooming" rather than a one-size-fits-all "View booking" (spec section 36). */
const BOOKING_LABEL_KEY_BY_CATEGORY: Record<ServiceCategory, string> = {
  [ServiceCategory.VET]: "home.action.viewBooking.vet",
  [ServiceCategory.GROOMING]: "home.action.viewBooking.grooming",
  [ServiceCategory.TRAINING]: "home.action.viewBooking.training",
  [ServiceCategory.WALKING]: "home.action.viewBooking.walking",
  [ServiceCategory.SITTING]: "home.action.viewBooking.sitting",
  [ServiceCategory.BOARDING]: "home.action.viewBooking.boarding",
  [ServiceCategory.PET_TAXI]: "home.action.viewBooking.petTaxi",
};

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
 * `category` (Handoff 04) drives which labelKey is shown — any service
 * category can surface here, not just vet visits (see
 * BOOKING_LABEL_KEY_BY_CATEGORY) — but the priority position never changes.
 */
export interface HomeRankingBookingInput {
  hasUpcoming: boolean;
  bookingId: string | null;
  category: ServiceCategory | null;
}

export interface HomeRankingInput {
  hasActivePet: boolean;
  /** The active pet's real ID, used to build concrete hrefs — null iff hasActivePet is false. */
  activePetId: string | null;
  interests: PetInterest[];
  health: HomeRankingHealthInput;
  care: HomeRankingCareInput;
  booking: HomeRankingBookingInput;
  /** Handoff 18: true iff the active pet's lifecycleStatus is DECEASED or MEMORIAL — see this service's own doc comment on memorial mode. */
  isMemorialModeActive: boolean;
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
 * upcoming service booking (any category — vet, grooming, training,
 * walking, sitting, boarding, pet taxi) > (fallback) VET interest or Ask AI,
 * with a care-profile-incomplete secondary action folded in only once none
 * of the above fired. An ordinary upcoming booking deliberately never
 * outranks a vaccination-due or health-incomplete signal, regardless of its
 * category — there is no emergency/critical-health severity logic yet (see
 * HealthSeverity), so a routine appointment (a grooming slot or a walk, same
 * as a vet visit) is never treated as more urgent than either. Home only
 * ever surfaces at most one upcoming-booking action at a time — it does not
 * attempt to summarize multiple categories together (spec section 36: "do
 * not overwhelm Home").
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

    // Handoff 18 memorial mode (spec: "stop inappropriate commercial/operational
    // prompts... no Buy again/Book now CTA on memorial-focused surfaces") — checked
    // before any vaccination/booking/care/interest signal so a DECEASED/MEMORIAL
    // pet can never surface a commerce nudge, regardless of what health/booking
    // data HomeService happened to pass in.
    if (input.isMemorialModeActive) {
      return {
        primaryAction: { kind: HomeActionKind.VIEW_MEMORIES, labelKey: "home.action.viewMemories", href: `/pets/${petId}/memories` },
        secondaryActions: [viewProfile],
      };
    }

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
      const labelKey = input.booking.category ? BOOKING_LABEL_KEY_BY_CATEGORY[input.booking.category] : "home.action.viewBooking.vet";
      return {
        primaryAction: {
          kind: HomeActionKind.VIEW_BOOKING,
          labelKey,
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
