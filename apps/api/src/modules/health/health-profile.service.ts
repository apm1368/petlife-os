import { Injectable } from "@nestjs/common";
import { SetupStatus, VaccinationStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { UpdateHealthProfileDto } from "./dto/update-health-profile.dto";

type Client = Pick<PrismaService, "healthProfile" | "allergy" | "condition" | "medication" | "vaccinationSummary">;

/**
 * Owns the one derived fact about a pet's health setup: HealthProfile.status.
 * Never client-settable directly — recomputed from the four Health Basics
 * domains every time one of them changes. A domain counts as "addressed"
 * once it has an answer at all (an explicit "no known X"/"don't know", or at
 * least one list row) — the actual clinical content is irrelevant to this
 * setup-completeness signal.
 */
@Injectable()
export class HealthProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async getOrDefault(petId: string) {
    const profile = await this.prisma.healthProfile.findUnique({ where: { petId } });
    if (profile) return profile;
    return {
      petId,
      status: SetupStatus.NOT_STARTED,
      allergiesOverallState: null,
      conditionsOverallState: null,
      medicationsOverallState: null,
      lastReviewedAt: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  async update(petId: string, dto: UpdateHealthProfileDto) {
    await this.prisma.healthProfile.upsert({
      where: { petId },
      update: {
        lastReviewedAt: dto.lastReviewedAt ? new Date(dto.lastReviewedAt) : undefined,
        allergiesOverallState: dto.allergiesOverallState,
        conditionsOverallState: dto.conditionsOverallState,
        medicationsOverallState: dto.medicationsOverallState,
      },
      create: {
        petId,
        lastReviewedAt: dto.lastReviewedAt ? new Date(dto.lastReviewedAt) : undefined,
        allergiesOverallState: dto.allergiesOverallState,
        conditionsOverallState: dto.conditionsOverallState,
        medicationsOverallState: dto.medicationsOverallState,
      },
    });

    await this.events.publish(
      "HealthProfileUpdated",
      { petId },
      { aggregateType: "Pet", aggregateId: petId },
    );

    return this.recomputeStatus(petId);
  }

  /**
   * Re-derives HealthProfile.status from the four Health Basics domains:
   * NOT_STARTED (none addressed) / PARTIAL (some) / COMPLETE (all four).
   * "Addressed" for allergies/conditions/medications = the list has a row
   * OR the corresponding overall-state field is set (an explicit answer to
   * "no known X" / "I don't know"). For vaccination = a VaccinationSummary
   * row exists with a status other than INCOMPLETE (INCOMPLETE is itself a
   * valid stored answer meaning "not yet resolved", so it does not count as
   * addressed). Called after every mutation to any of the four domains.
   */
  async recomputeStatus(petId: string, client: Client = this.prisma) {
    const [profile, allergyCount, conditionCount, medicationCount, vaccination] = await Promise.all([
      client.healthProfile.findUnique({ where: { petId } }),
      client.allergy.count({ where: { petId } }),
      client.condition.count({ where: { petId } }),
      client.medication.count({ where: { petId } }),
      client.vaccinationSummary.findUnique({ where: { petId } }),
    ]);

    const allergiesAddressed = allergyCount > 0 || profile?.allergiesOverallState != null;
    const conditionsAddressed = conditionCount > 0 || profile?.conditionsOverallState != null;
    const medicationsAddressed = medicationCount > 0 || profile?.medicationsOverallState != null;
    const vaccinationAddressed = Boolean(vaccination && vaccination.status !== VaccinationStatus.INCOMPLETE);

    const addressedCount = [allergiesAddressed, conditionsAddressed, medicationsAddressed, vaccinationAddressed].filter(
      Boolean,
    ).length;

    const status =
      addressedCount === 0 ? SetupStatus.NOT_STARTED : addressedCount === 4 ? SetupStatus.COMPLETE : SetupStatus.PARTIAL;

    return client.healthProfile.upsert({
      where: { petId },
      update: { status },
      create: { petId, status },
    });
  }
}
