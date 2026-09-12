import { Injectable } from "@nestjs/common";
import type { PatientVitalsDto, VitalsTrendsDto, VitalsTrendPointDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { assertVisitBelongsToPet } from "../clinical-health/clinical-link.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { PROVIDER_ACTOR_INCLUDE, toPatientVitalsDto } from "./vet-panel.mapper";
import type { CreateVitalsDto } from "./dto/vitals.dto";

const DEFAULT_HISTORY_LIMIT = 30;

/**
 * The structured half of an exam. A vitals row is append-only: there is no
 * update or delete endpoint at all, because a measurement is a statement
 * about a moment — correcting one means recording the new measurement (and,
 * for an owner who disputes it, Handoff 17's MedicalRecordCorrection path).
 *
 * Recording a weight also updates `Pet.latestWeightValue`/`latestWeightUnit`
 * in the same transaction. That field is the owner-facing "current weight"
 * the rest of the product already reads, and leaving it stale after a clinic
 * literally put the animal on a scale would be the worse failure. It stays a
 * plain last-write-wins field — the vitals row, not the Pet column, is the
 * historical record.
 */
@Injectable()
export class PatientVitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(ctx: ResolvedProviderContext, dto: CreateVitalsDto): Promise<PatientVitalsDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patientVitalsRecord.create({
        data: {
          petId: dto.petId,
          clinicalVisitId: dto.clinicalVisitId ?? null,
          hospitalizationId: dto.hospitalizationId ?? null,
          recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
          weightValue: dto.weightValue ?? null,
          weightUnit: dto.weightUnit ?? null,
          temperatureC: dto.temperatureC ?? null,
          heartRateBpm: dto.heartRateBpm ?? null,
          respiratoryRateBpm: dto.respiratoryRateBpm ?? null,
          capillaryRefillSeconds: dto.capillaryRefillSeconds ?? null,
          systolicBloodPressure: dto.systolicBloodPressure ?? null,
          oxygenSaturationPercent: dto.oxygenSaturationPercent ?? null,
          bloodGlucoseMgDl: dto.bloodGlucoseMgDl ?? null,
          mucousMembraneColor: dto.mucousMembraneColor ?? null,
          hydrationStatus: dto.hydrationStatus ?? null,
          bodyConditionScore: dto.bodyConditionScore ?? null,
          bodyConditionScale: dto.bodyConditionScale ?? null,
          painScore: dto.painScore ?? null,
          painScale: dto.painScale ?? null,
          triageLevel: dto.triageLevel ?? null,
          notes: dto.notes ?? null,
          providerOrganizationId: ctx.organizationId,
          providerUserId: ctx.providerUserId,
        },
        include: PROVIDER_ACTOR_INCLUDE,
      });

      if (dto.weightValue !== undefined && dto.weightUnit !== undefined) {
        await tx.pet.update({ where: { id: dto.petId }, data: { latestWeightValue: dto.weightValue, latestWeightUnit: dto.weightUnit } });
      }

      await this.events.publish("PatientVitalsRecorded", { petId: dto.petId, vitalsId: created.id }, { tx, aggregateType: "Pet", aggregateId: dto.petId });
      return created;
    });

    return toPatientVitalsDto(row);
  }

  async list(petId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<PatientVitalsDto[]> {
    const rows = await this.prisma.patientVitalsRecord.findMany({
      where: { petId },
      include: PROVIDER_ACTOR_INCLUDE,
      orderBy: { recordedAt: "desc" },
      take: limit,
    });
    return rows.map(toPatientVitalsDto);
  }

  async latest(petId: string): Promise<PatientVitalsDto | null> {
    const row = await this.prisma.patientVitalsRecord.findFirst({ where: { petId }, include: PROVIDER_ACTOR_INCLUDE, orderBy: { recordedAt: "desc" } });
    return row ? toPatientVitalsDto(row) : null;
  }

  /**
   * Trends are a straight re-projection: one point per row that actually
   * carries the measurement, in chronological order. Nothing is interpolated,
   * averaged, or gap-filled — a series with two points genuinely has two
   * measurements, and the UI says so rather than drawing a confident line.
   * Weight is normalised to kilograms for the series only (a mixed kg/lb
   * history would otherwise plot as a cliff); the stored rows keep whatever
   * unit was recorded.
   */
  async trends(petId: string, limit = 100): Promise<VitalsTrendsDto> {
    const rows = await this.prisma.patientVitalsRecord.findMany({ where: { petId }, orderBy: { recordedAt: "asc" }, take: limit });

    const series = (pick: (r: (typeof rows)[number]) => number | null): VitalsTrendPointDto[] =>
      rows
        .map((r) => ({ recordedAt: r.recordedAt.toISOString(), value: pick(r) }))
        .filter((p): p is VitalsTrendPointDto => p.value !== null);

    return {
      petId,
      weightKg: series((r) => (r.weightValue === null ? null : r.weightUnit === "LB" ? Number(r.weightValue) * 0.45359237 : Number(r.weightValue))),
      temperatureC: series((r) => (r.temperatureC === null ? null : Number(r.temperatureC))),
      heartRateBpm: series((r) => r.heartRateBpm),
      respiratoryRateBpm: series((r) => r.respiratoryRateBpm),
      bodyConditionScore: series((r) => r.bodyConditionScore),
      painScore: series((r) => r.painScore),
    };
  }
}
