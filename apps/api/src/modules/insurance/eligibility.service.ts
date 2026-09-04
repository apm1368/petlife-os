import { Injectable } from "@nestjs/common";
import type { InsuranceProduct, Pet } from "@prisma/client";
import { InsuranceEligibilityStatus } from "@petlife/types";
import type { InsuranceEligibilityResultDto } from "@petlife/types";

function ageInMonths(pet: Pet): number | null {
  if (pet.birthDate) {
    const ms = Date.now() - pet.birthDate.getTime();
    return Math.floor(ms / (30.44 * 24 * 60 * 60 * 1000));
  }
  return pet.approximateAgeMonths ?? null;
}

/**
 * Computes eligibility purely from structured criteria (species/age) —
 * never guarantees insurer approval (spec's locked rule). Only returns
 * ELIGIBLE when every criterion the product declares is both known and
 * satisfied; anything it cannot fully evaluate (e.g. the pet's age is
 * unrecorded) resolves to POSSIBLY_ELIGIBLE, never ELIGIBLE. A clear,
 * known disqualifier (wrong species, age outside range) is the only path
 * to NOT_ELIGIBLE.
 */
@Injectable()
export class EligibilityService {
  evaluate(pet: Pet, product: InsuranceProduct): InsuranceEligibilityResultDto {
    const reasons: string[] = [];

    const speciesEligible = product.speciesEligibility.length === 0 || product.speciesEligibility.includes(pet.species);
    if (!speciesEligible) {
      reasons.push("SPECIES_NOT_COVERED");
      return { status: InsuranceEligibilityStatus.NOT_ELIGIBLE, reasons };
    }

    const months = ageInMonths(pet);
    let ageKnownAndWithinRange = true;
    let ageUnknown = false;

    if (product.minAgeMonths !== null || product.maxAgeMonths !== null) {
      if (months === null) {
        ageUnknown = true;
        reasons.push("PET_AGE_UNKNOWN");
      } else {
        if (product.minAgeMonths !== null && months < product.minAgeMonths) {
          reasons.push("PET_BELOW_MINIMUM_AGE");
          ageKnownAndWithinRange = false;
        }
        if (product.maxAgeMonths !== null && months > product.maxAgeMonths) {
          reasons.push("PET_ABOVE_MAXIMUM_AGE");
          ageKnownAndWithinRange = false;
        }
      }
    }

    if (!ageKnownAndWithinRange) {
      return { status: InsuranceEligibilityStatus.NOT_ELIGIBLE, reasons };
    }
    if (ageUnknown) {
      return { status: InsuranceEligibilityStatus.POSSIBLY_ELIGIBLE, reasons };
    }
    return { status: InsuranceEligibilityStatus.ELIGIBLE, reasons: [] };
  }
}
