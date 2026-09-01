import { Injectable } from "@nestjs/common";
import { SetupStatus, WeightUnit, type Pet, type ProviderService } from "@prisma/client";
import { PetCompatibilityStatus, type PetCompatibilityDto, type PetCompatibilityReason } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";

const LB_TO_KG = 0.453592;

function ageInMonths(pet: Pet, now: Date): number | null {
  if (pet.birthDate) {
    const months = (now.getFullYear() - pet.birthDate.getFullYear()) * 12 + (now.getMonth() - pet.birthDate.getMonth());
    return Math.max(0, months);
  }
  return pet.approximateAgeMonths ?? null;
}

function weightInKg(pet: Pet): number | null {
  if (pet.latestWeightValue === null) return null;
  const value = Number(pet.latestWeightValue);
  return pet.latestWeightUnit === WeightUnit.LB ? value * LB_TO_KG : value;
}

/**
 * Deterministic, no-ML compatibility check (Handoff 04 section 5). A service
 * is only ever reported NOT_SUPPORTED for a genuinely disqualifying fact
 * (species, or an age/weight value that is known and out of range) — when
 * the pet is missing the information a restriction needs (age, weight, Care
 * Profile, Health Basics), the result is UNKNOWN or NEEDS_REVIEW, never a
 * false COMPATIBLE. This never produces a medical recommendation — it only
 * reports which of the service's own stated restrictions apply.
 */
@Injectable()
export class PetServiceCompatibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(pet: Pet, service: ProviderService): Promise<PetCompatibilityDto> {
    const reasons: PetCompatibilityReason[] = [];
    let worst: PetCompatibilityStatus = PetCompatibilityStatus.COMPATIBLE;
    const escalate = (status: PetCompatibilityStatus) => {
      const rank: Record<PetCompatibilityStatus, number> = {
        [PetCompatibilityStatus.COMPATIBLE]: 0,
        [PetCompatibilityStatus.NEEDS_REVIEW]: 1,
        [PetCompatibilityStatus.UNKNOWN]: 2,
        [PetCompatibilityStatus.NOT_SUPPORTED]: 3,
      };
      if (rank[status] > rank[worst]) worst = status;
    };

    const speciesSupported = pet.species === "DOG" ? service.supportsDog : pet.species === "CAT" ? service.supportsCat : true;
    if (!speciesSupported) {
      reasons.push("SPECIES_UNSUPPORTED");
      escalate(PetCompatibilityStatus.NOT_SUPPORTED);
    }

    if (service.minAgeMonths !== null || service.maxAgeMonths !== null) {
      const age = ageInMonths(pet, new Date());
      if (age === null) {
        reasons.push("AGE_UNKNOWN");
        escalate(PetCompatibilityStatus.UNKNOWN);
      } else {
        if (service.minAgeMonths !== null && age < service.minAgeMonths) {
          reasons.push("AGE_TOO_YOUNG");
          escalate(PetCompatibilityStatus.NOT_SUPPORTED);
        }
        if (service.maxAgeMonths !== null && age > service.maxAgeMonths) {
          reasons.push("AGE_TOO_OLD");
          escalate(PetCompatibilityStatus.NOT_SUPPORTED);
        }
      }
    }

    if (service.minWeightKg !== null || service.maxWeightKg !== null) {
      const weight = weightInKg(pet);
      if (weight === null) {
        reasons.push("WEIGHT_UNKNOWN");
        escalate(PetCompatibilityStatus.UNKNOWN);
      } else {
        if (service.minWeightKg !== null && weight < Number(service.minWeightKg)) {
          reasons.push("WEIGHT_TOO_LOW");
          escalate(PetCompatibilityStatus.NOT_SUPPORTED);
        }
        if (service.maxWeightKg !== null && weight > Number(service.maxWeightKg)) {
          reasons.push("WEIGHT_TOO_HIGH");
          escalate(PetCompatibilityStatus.NOT_SUPPORTED);
        }
      }
    }

    if (service.requiresCareProfile) {
      const careProfile = await this.prisma.careProfile.findUnique({ where: { petId: pet.id } });
      if ((careProfile?.status ?? SetupStatus.NOT_STARTED) !== SetupStatus.COMPLETE) {
        reasons.push("CARE_PROFILE_REQUIRED");
        escalate(PetCompatibilityStatus.NEEDS_REVIEW);
      }
    }

    if (service.requiresHealthBasics) {
      const healthProfile = await this.prisma.healthProfile.findUnique({ where: { petId: pet.id } });
      if ((healthProfile?.status ?? SetupStatus.NOT_STARTED) !== SetupStatus.COMPLETE) {
        reasons.push("HEALTH_BASICS_REQUIRED");
        escalate(PetCompatibilityStatus.NEEDS_REVIEW);
      }
    }

    return { status: worst, reasons };
  }
}
