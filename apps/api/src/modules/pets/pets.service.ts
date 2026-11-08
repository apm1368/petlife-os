import { Injectable } from "@nestjs/common";
import {
  HouseholdRole,
  LostPetIncidentStatus,
  OnboardingChapter,
  PetLifecycleStatus,
  Prisma,
} from "@prisma/client";
import type { PetMicrochipConflictDetails } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  HouseholdAccessDeniedException,
  NotFoundApiException,
  ValidationApiException,
} from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { EntitlementService } from "../subscriptions/entitlement.service";
import { PetLifecycleService } from "./pet-lifecycle.service";
import { SubscriptionService } from "../subscriptions/subscription.service";
import type { CreatePetDto } from "./dto/create-pet.dto";
import type { UpdatePetDto } from "./dto/update-pet.dto";

/**
 * `pets_microchip_normalized_key` is a partial unique index across every household, so a chip that
 * is already on file anywhere rejects the write. Prisma surfaces that as P2002, and an uncaught one
 * leaves the owner with a generic 500 ("an unexpected error occurred") on a form that is otherwise
 * valid — nothing names the field, so "try again" can never succeed. Translate it into the ordinary
 * field-level validation error the client already renders next to the microchip input.
 */
function rethrowDuplicateMicrochip(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    String((error.meta as { target?: unknown } | undefined)?.target ?? "").includes("microchip")
  ) {
    throw new ValidationApiException({
      field: "microchipNumber",
      reason: "MICROCHIP_ALREADY_REGISTERED",
    } satisfies PetMicrochipConflictDetails);
  }
  throw error;
}

/** Strip separators for uniqueness checks, preserving the owner's raw value in microchipNumber. */
export function normalizeMicrochip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw
    .trim()
    .replace(/[\s\-.]/g, "")
    .toUpperCase();
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
    private readonly subscriptions: SubscriptionService,
  ) {}

  async create(householdId: string, creatorUserId: string, dto: CreatePetDto) {
    // spec: "limit checks must happen server-side" — checked before creation,
    // never blocking access to pets the household already has (over-limit
    // existing pets stay fully usable; only the NEXT create is refused).
    //
    // A plain check-then-act here has a real race window: two concurrent
    // requests for a household already one pet under its limit could both
    // read "within limit" before either commits, both succeed, and leave the
    // household over its plan's pets.max (Handoff 20 hardening). A
    // transaction-scoped Postgres advisory lock keyed by householdId
    // serializes concurrent creates for the SAME household — the second
    // transaction blocks until the first commits (or rolls back) and
    // releases the lock automatically, at which point its own limit check
    // sees the first pet's now-committed row. This needs no change to
    // EntitlementService/UsageService (which read via a separate,
    // non-transactional connection and therefore only ever see committed
    // state) and does not serialize unrelated households against each other.
    const created = await this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${householdId})::bigint)`;
        await this.entitlements.assertWithinLimit(householdId, "pets.max");

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

        await this.petAccess.applyHouseholdDefaults(pet.id, householdId, creatorUserId, tx);

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

        // Keep the first onboarding pet recoverable even if the client's subsequent
        // progress write fails. Bind only this creator's matching active identity flow.
        await tx.onboardingProgress.updateMany({
          where: { userId: creatorUserId, householdId, petId: null, chapter: OnboardingChapter.PET_IDENTITY },
          data: { petId: pet.id },
        });

        await this.events.publish(
          "PetCreated",
          { petId: pet.id, householdId, creatorUserId },
          { tx, aggregateType: "Pet", aggregateId: pet.id },
        );

        return pet;
      })
      .catch(rethrowDuplicateMicrochip);
    // After commit: the household's first successful pet starts its welcome trial (decision 4). Best effort —
    // an already-used trial never fails the pet creation.
    await this.subscriptions.startWelcomeTrial(householdId, creatorUserId);
    return created;
  }

  async getById(id: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id } });
    if (!pet) throw new NotFoundApiException("Pet");
    return pet;
  }

  /** Household membership alone shows nothing: only pets the caller holds an active canViewIdentity grant for. */
  async listForHousehold(householdId: string, userId: string) {
    const pets = await this.prisma.pet.findMany({
      where: { householdId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const visible = await Promise.all(
      pets.map(
        async (pet) =>
          (await this.petAccess.getEffectivePermissions(pet.id, userId))?.canViewIdentity === true,
      ),
    );
    return pets.filter((_, i) => visible[i]);
  }

  async update(id: string, dto: UpdatePetDto) {
    return this.prisma
      .$transaction(async (tx) => {
        const pet = await tx.pet.update({
          where: { id },
          data: {
            ...dto,
            birthDate:
              dto.birthDate === undefined ? undefined : dto.birthDate ? new Date(dto.birthDate) : null,
            microchipNormalized:
              dto.microchipNumber === undefined ? undefined : normalizeMicrochip(dto.microchipNumber),
          },
        });
        await this.events.publish(
          "PetProfileUpdated",
          { petId: id, changedFields: Object.keys(dto).sort() },
          { tx, aggregateType: "Pet", aggregateId: id },
        );
        return pet;
      })
      .catch(rethrowDuplicateMicrochip);
  }

  /**
   * spec: "Memorial transition must be explicit and auditable. Do not
   * automatically infer death from health data." This is the ONLY place a
   * household can move a pet to DECEASED — never inferred from any health
   * record, observation, or clinical visit anywhere else in the codebase.
   */
  async markDeceased(petId: string, actorUserId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lifecycle.transition(tx, petId, PetLifecycleStatus.DECEASED, {
        sourceType: "MANUAL_MEMORIAL",
        actorUserId,
        reason,
      });
      await this.suspendOpenCareReminders(tx, petId);
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
      await this.lifecycle.transition(tx, petId, PetLifecycleStatus.MEMORIAL, {
        sourceType: "MANUAL_MEMORIAL",
        actorUserId,
        reason,
      });
      return tx.pet.findUniqueOrThrow({ where: { id: petId } });
    });
  }

  /**
   * PT-03. Only an actual household OWNER can self-correct a recently
   * accidental LOST/DECEASED lifecycle fact. Pet access alone is deliberately
   * insufficient: a shared caretaker must not resurrect a pet or withdraw a
   * public lost-pet report. The original transition and this correction remain
   * append-only records.
   */
  async correctLifecycleToActive(petId: string, actorUserId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.findUniqueOrThrow({
        where: { id: petId },
        select: { id: true, householdId: true },
      });
      const membership = await tx.householdMember.findUnique({
        where: { householdId_userId: { householdId: pet.householdId, userId: actorUserId } },
        select: { role: true },
      });
      if (membership?.role !== HouseholdRole.OWNER) {
        throw new HouseholdAccessDeniedException({
          petId,
          reason: "HOUSEHOLD_OWNER_REQUIRED_FOR_LIFECYCLE_CORRECTION",
        });
      }

      const correctedFrom = await this.lifecycle.correctToActive(tx, petId, actorUserId, reason);
      if (correctedFrom === PetLifecycleStatus.LOST) {
        // A correction means the report itself was erroneous, not that the pet
        // was reunited. Closing it removes it from public discovery without
        // rewriting any report or sighting evidence.
        await tx.lostPetIncident.updateMany({
          where: {
            petId,
            status: {
              in: [
                LostPetIncidentStatus.OPEN,
                LostPetIncidentStatus.SEARCHING,
                LostPetIncidentStatus.SIGHTING_REPORTED,
                LostPetIncidentStatus.FOUND,
              ],
            },
          },
          data: { status: LostPetIncidentStatus.CLOSED, closedAt: new Date() },
        });
      }
      if (correctedFrom === PetLifecycleStatus.DECEASED) {
        await this.restoreLifecycleSuspendedCareReminders(tx, petId);
      }
      await this.events.publish(
        "PetLifecycleCorrectionApplied",
        { petId, correctedFrom, actorUserId },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return tx.pet.findUniqueOrThrow({ where: { id: petId } });
    });
  }

  /** PT-12: this is a reversible safety pause, never a destructive cancellation. */
  private async suspendOpenCareReminders(tx: Prisma.TransactionClient, petId: string) {
    const now = new Date();
    const rows = await tx.careReminder.findMany({
      where: {
        petId,
        lifecycleSuspendedAt: null,
        state: { notIn: ["COMPLETED", "SKIPPED", "CANCELLED"] },
      },
      select: { id: true, state: true },
    });
    await Promise.all(
      rows.map((row) =>
        tx.careReminder.update({
          where: { id: row.id },
          data: {
            state: "CANCELLED",
            cancelledAt: now,
            lifecycleSuspendedAt: now,
            lifecycleSuspendedState: row.state,
          },
        }),
      ),
    );
  }

  /** A PT-03 correction restores only reminders stopped by the lifecycle safety pause. */
  private async restoreLifecycleSuspendedCareReminders(tx: Prisma.TransactionClient, petId: string) {
    const rows = await tx.careReminder.findMany({
      where: { petId, lifecycleSuspendedAt: { not: null }, state: "CANCELLED" },
      select: { id: true, lifecycleSuspendedState: true },
    });
    await Promise.all(
      rows.map((row) =>
        tx.careReminder.update({
          where: { id: row.id },
          data: {
            state: row.lifecycleSuspendedState ?? "UPCOMING",
            cancelledAt: null,
            notifiedAt: null,
            lifecycleSuspendedAt: null,
            lifecycleSuspendedState: null,
          },
        }),
      ),
    );
  }
}
