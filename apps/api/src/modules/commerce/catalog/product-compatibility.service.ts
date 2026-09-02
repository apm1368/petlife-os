import { Injectable } from "@nestjs/common";
import { AllergyKnowledgeState, AllergyStatus, SetupStatus, WeightUnit, type Pet, type Product } from "@prisma/client";
import { ProductCompatibilityStatus, type ProductCompatibilityDto, type ProductCompatibilityReason } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { PetAccessService } from "../../pet-access/pet-access.service";

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

const RANK: Record<ProductCompatibilityStatus, number> = {
  [ProductCompatibilityStatus.COMPATIBLE]: 0,
  [ProductCompatibilityStatus.LIKELY_COMPATIBLE]: 1,
  [ProductCompatibilityStatus.UNKNOWN]: 2,
  [ProductCompatibilityStatus.NEEDS_REVIEW]: 3,
  [ProductCompatibilityStatus.NOT_RECOMMENDED]: 4,
  [ProductCompatibilityStatus.POTENTIAL_SAFETY_CONFLICT]: 5,
};

/**
 * Deterministic, no-ML compatibility check (spec sections 11-13) — the
 * shared service both Shop and (later) AI must consume; AI must never
 * invent compatibility independently. Mirrors
 * PetServiceCompatibilityService's (Handoff 04) escalate-to-worst-status
 * shape exactly, extended with the two states this handoff's vocabulary
 * adds: LIKELY_COMPATIBLE (no product constraint actually applied — nothing
 * to confirm, so this is never sold as a real endorsement) and
 * POTENTIAL_SAFETY_CONFLICT, which always outranks every other status (spec
 * section 13) and is the one state this service will still not report on
 * blind trust — it requires the caller to have actual health-data access to
 * the pet (canViewHealth) before it will even attempt the allergen check;
 * without that access the result is NEEDS_REVIEW, never a false-negative
 * COMPATIBLE and never a leaked inference either.
 */
@Injectable()
export class ProductCompatibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petAccess: PetAccessService,
  ) {}

  /**
   * `requestingUserId` is used only to resolve canViewHealth for the
   * allergen-conflict rule — never to fetch or expose raw health data
   * itself. Optional since product discovery/detail (Handoff 12) is public:
   * an anonymous caller (or one who explicitly passes someone else's petId)
   * degrades to the same "no permission" NEEDS_REVIEW branch a signed-in
   * non-member already gets — never elevated access.
   */
  async evaluate(pet: Pet, product: Product, requestingUserId?: string): Promise<ProductCompatibilityDto> {
    const reasons: ProductCompatibilityReason[] = [];
    let worst = ProductCompatibilityStatus.LIKELY_COMPATIBLE;
    let anyConstraintPassed = false;
    const escalate = (status: ProductCompatibilityStatus) => {
      if (RANK[status] > RANK[worst]) worst = status;
    };

    const speciesSupported = pet.species === "DOG" ? product.supportsDog : pet.species === "CAT" ? product.supportsCat : true;
    if (!speciesSupported) {
      reasons.push("SPECIES_MISMATCH");
      escalate(ProductCompatibilityStatus.NOT_RECOMMENDED);
    } else if (!product.supportsDog || !product.supportsCat) {
      anyConstraintPassed = true;
    }

    if (product.minAgeMonths !== null || product.maxAgeMonths !== null) {
      const age = ageInMonths(pet, new Date());
      if (age === null) {
        reasons.push("AGE_UNKNOWN");
        escalate(ProductCompatibilityStatus.UNKNOWN);
      } else {
        let violated = false;
        if (product.minAgeMonths !== null && age < product.minAgeMonths) {
          reasons.push("AGE_TOO_YOUNG");
          escalate(ProductCompatibilityStatus.NOT_RECOMMENDED);
          violated = true;
        }
        if (product.maxAgeMonths !== null && age > product.maxAgeMonths) {
          reasons.push("AGE_TOO_OLD");
          escalate(ProductCompatibilityStatus.NOT_RECOMMENDED);
          violated = true;
        }
        if (!violated) anyConstraintPassed = true;
      }
    }

    if (product.minWeightKg !== null || product.maxWeightKg !== null) {
      const weight = weightInKg(pet);
      if (weight === null) {
        reasons.push("WEIGHT_UNKNOWN");
        escalate(ProductCompatibilityStatus.UNKNOWN);
      } else {
        let violated = false;
        if (product.minWeightKg !== null && weight < Number(product.minWeightKg)) {
          reasons.push("WEIGHT_TOO_LOW");
          escalate(ProductCompatibilityStatus.NOT_RECOMMENDED);
          violated = true;
        }
        if (product.maxWeightKg !== null && weight > Number(product.maxWeightKg)) {
          reasons.push("WEIGHT_TOO_HIGH");
          escalate(ProductCompatibilityStatus.NOT_RECOMMENDED);
          violated = true;
        }
        if (!violated) anyConstraintPassed = true;
      }
    }

    if (product.requiresHealthReview) {
      const healthProfile = await this.prisma.healthProfile.findUnique({ where: { petId: pet.id } });
      if ((healthProfile?.status ?? SetupStatus.NOT_STARTED) !== SetupStatus.COMPLETE) {
        reasons.push("HEALTH_REVIEW_REQUIRED");
        escalate(ProductCompatibilityStatus.NEEDS_REVIEW);
      } else {
        anyConstraintPassed = true;
      }
    }

    if (product.allergenTags.length > 0) {
      const effective = requestingUserId ? await this.petAccess.getEffectivePermissions(pet.id, requestingUserId) : undefined;
      if (!effective?.canViewHealth) {
        reasons.push("HEALTH_REVIEW_REQUIRED");
        escalate(ProductCompatibilityStatus.NEEDS_REVIEW);
      } else {
        const activeAllergies = await this.prisma.allergy.findMany({
          where: { petId: pet.id, status: AllergyStatus.ACTIVE, knowledgeState: AllergyKnowledgeState.KNOWN },
        });
        const petAllergenTags = new Set(activeAllergies.map((a) => a.name.trim().toUpperCase()));
        const conflict = product.allergenTags.some((tag) => petAllergenTags.has(tag));
        if (conflict) {
          reasons.push("ALLERGEN_CONFLICT");
          escalate(ProductCompatibilityStatus.POTENTIAL_SAFETY_CONFLICT);
        } else {
          anyConstraintPassed = true;
        }
      }
    }

    if (worst === ProductCompatibilityStatus.LIKELY_COMPATIBLE && anyConstraintPassed) {
      worst = ProductCompatibilityStatus.COMPATIBLE;
    }

    return { status: worst, reasons };
  }
}
