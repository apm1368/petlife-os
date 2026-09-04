import { Injectable } from "@nestjs/common";
import { PetLifecycleStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { EntitlementService } from "../subscriptions/entitlement.service";
import { PetLifecycleService } from "./pet-lifecycle.service";
import type { CreatePetDto } from "./dto/create-pet.dto";
import type { UpdatePetDto } from "./dto/update-pet.dto";

/**
 * Normalization rule: strip whitespace and common separators (space, hyphen,
 * dot), upper-case the rest. Used only to detect duplicate chips reliably —
 * the raw value the owner/importer entered is always preserved verbatim and
 * never rejected, since a legacy/imported value that can't be confidently
 * normalized still needs to be stored.
 */
export function normalizeMicrochip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(/[\s\-.]/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petAccess: PetAccessService,
    private readonly events: DomainEventsService,
    private readonly entitlements: EntitlementService,
    private readonly lifecycle: PetLifecycleService,
  ) {}

  async create(householdId: string, creatorUserId: string, dto: CreatePetDto) {
    if (!dto.birthDate && dto.approximateAgeMonths === undefined) {
      throw new ValidationApiException({ field: "birthDate", reason: "birthDate or approximateAgeMonths is required" });
    }

    // spec: "limit checks must happen server-side" — checked before creation,
    // never blocking access to pets the household already has (over-limit
    // existing pets stay fully usable; only the NEXT create is refused).
    await this.entitlements.assertWithinLimit(householdId, "pets.max");

    return this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.create({
        data: {
          householdId,
          name: dto.name,
          species: dto.species,
          breed: dto.breed,
          sex: dto.sex,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          approximateAgeMonths: dto.approximateAgeMonths,
          photoUrl: dto.photoUrl,
          latestWeightValue: dto.latestWeightValue,
          latestWeightUnit: dto.latestWeightUnit,
          colorMarkings: dto.colorMarkings,
          neuteredStatus: dto.neuteredStatus,
          microchipNumber: dto.microchipNumber,
          microchipNormalized: normalizeMicrochip(dto.microchipNumber),
        },
      });

      await this.petAccess.applyHouseholdDefaults(pet.id, householdId, tx);

      const hasActivePet = await tx.activePetPreference.findUnique({
        where: { userId_householdId: { userId: creatorUserId, householdId } },
      });

      if (!hasActivePet) {
        await tx.activePetPreference.create({
          data: { userId: creatorUserId, householdId, petId: pet.id },
        });
        await this.events.publish(
          "ActivePetChanged",
          { userId: creatorUserId, householdId, petId: pet.id },
          { tx, aggregateType: "Pet", aggregateId: pet.id },
        );
      }

      await this.events.publish(
        "PetCreated",
        { petId: pet.id, householdId, creatorUserId },
        { tx, aggregateType: "Pet", aggregateId: pet.id },
      );

      return pet;
    });
  }

  async getById(id: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id } });
    if (!pet) throw new NotFoundApiException("Pet");
    return pet;
  }

  async listForHousehold(householdId: string) {
    return this.prisma.pet.findMany({ where: { householdId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  }

  async update(id: string, dto: UpdatePetDto) {
    return this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.update({
        where: { id },
        data: {
          ...dto,
          birthDate: dto.birthDate === undefined ? undefined : dto.birthDate ? new Date(dto.birthDate) : null,
          microchipNormalized:
            dto.microchipNumber === undefined ? undefined : normalizeMicrochip(dto.microchipNumber),
        },
      });
      await this.events.publish("PetProfileUpdated", { petId: id }, { tx, aggregateType: "Pet", aggregateId: id });
      return pet;
    });
  }

  /**
   * spec: "Memorial transition must be explicit and auditable. Do not
   * automatically infer death from health data." This is the ONLY place a
   * household can move a pet to DECEASED — never inferred from any health
   * record, observation, or clinical visit anywhere else in the codebase.
   */
  async markDeceased(petId: string, actorUserId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lifecycle.transition(tx, petId, PetLifecycleStatus.DECEASED, { sourceType: "MANUAL_MEMORIAL", actorUserId, reason });
      return tx.pet.findUniqueOrThrow({ where: { id: petId } });
    });
  }

  /**
   * spec: "Deceased vs Memorial: keep distinction explicit. DECEASED = a
   * lifecycle fact. MEMORIAL = experience mode/retained identity state." A
   * separate, explicit household action from markDeceased — DECEASED never
   * auto-advances to MEMORIAL on its own.
   */
  async transitionToMemorial(petId: string, actorUserId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lifecycle.transition(tx, petId, PetLifecycleStatus.MEMORIAL, { sourceType: "MANUAL_MEMORIAL", actorUserId, reason });
      return tx.pet.findUniqueOrThrow({ where: { id: petId } });
    });
  }
}
