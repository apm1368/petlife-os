import { Injectable } from "@nestjs/common";
import { MedicationStatus, PrescriptionRoute, PrescriptionStatus, SourceType } from "@prisma/client";
import type { PrescriptionDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { InvalidPrescriptionTransitionException, PrescriptionNotFoundException, ProviderAccessDeniedException } from "../../common/errors/api-exception";
import { assertVisitBelongsToPet } from "../clinical-health/clinical-link.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { PROVIDER_ACTOR_INCLUDE, toPrescriptionDto } from "./vet-panel.mapper";
import type { CancelPrescriptionDto, CreatePrescriptionDto, DispenseRefillDto } from "./dto/prescription.dto";

/**
 * Issuing a prescription is one transaction that writes two rows with two
 * different jobs: the `Prescription` (the dispensing record — quantity,
 * refills, controlled-substance flag, prescriber) and the `Medication`
 * (Handoff 02's owner-facing "what is my pet taking" list). The Medication
 * row is created here rather than left to the owner to re-enter, and this is
 * the *only* provider write path into it — `MedicationsService` remains the
 * owner's path, and Handoff 17's `assertOwnerEditable` already stops an owner
 * editing a PROVIDER-sourced medication in place.
 *
 * No dose is ever computed server-side. The panel offers a mg/kg helper next
 * to the field, but only the number a prescriber actually typed is stored.
 */
@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(ctx: ResolvedProviderContext, dto: CreatePrescriptionDto): Promise<PrescriptionDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);
    const createMedication = dto.createMedicationRecord ?? true;

    const row = await this.prisma.$transaction(async (tx) => {
      const medication = createMedication
        ? await tx.medication.create({
            data: {
              petId: dto.petId,
              name: dto.strength ? `${dto.drugName} ${dto.strength}` : dto.drugName,
              dosage: dto.doseAmount ?? null,
              unit: dto.doseUnit ?? null,
              frequencyText: dto.frequencyText ?? null,
              route: (dto.route ?? PrescriptionRoute.ORAL) as string,
              status: MedicationStatus.ACTIVE,
              startDate: dto.startAt ? new Date(dto.startAt) : null,
              endDate: dto.endAt ? new Date(dto.endAt) : null,
              instructions: dto.instructionsForOwner ?? null,
              sourceType: SourceType.PROVIDER,
              sourceLabel: ctx.organizationName,
              clinicalVisitId: dto.clinicalVisitId ?? null,
            },
          })
        : null;

      const created = await tx.prescription.create({
        data: {
          petId: dto.petId,
          providerOrganizationId: ctx.organizationId,
          providerUserId: ctx.providerUserId,
          clinicalVisitId: dto.clinicalVisitId ?? null,
          medicationId: medication?.id ?? null,
          drugName: dto.drugName,
          strength: dto.strength ?? null,
          form: dto.form ?? null,
          route: dto.route ?? PrescriptionRoute.ORAL,
          doseAmount: dto.doseAmount ?? null,
          doseUnit: dto.doseUnit ?? null,
          frequencyText: dto.frequencyText ?? null,
          durationDays: dto.durationDays ?? null,
          quantityDispensed: dto.quantityDispensed ?? null,
          quantityUnit: dto.quantityUnit ?? null,
          refillsAuthorized: dto.refillsAuthorized ?? 0,
          isControlledSubstance: dto.isControlledSubstance ?? false,
          instructionsForOwner: dto.instructionsForOwner ?? null,
          internalNotes: dto.internalNotes ?? null,
          startAt: dto.startAt ? new Date(dto.startAt) : null,
          endAt: dto.endAt ? new Date(dto.endAt) : null,
        },
        include: PROVIDER_ACTOR_INCLUDE,
      });

      await this.events.publish(
        "PrescriptionIssued",
        { petId: dto.petId, prescriptionId: created.id, isControlledSubstance: created.isControlledSubstance },
        { tx, aggregateType: "Pet", aggregateId: dto.petId },
      );
      return created;
    });

    return toPrescriptionDto(row);
  }

  async list(petId: string, audience: "PROVIDER" | "OWNER" = "PROVIDER"): Promise<PrescriptionDto[]> {
    const rows = await this.prisma.prescription.findMany({ where: { petId }, include: PROVIDER_ACTOR_INCLUDE, orderBy: { prescribedAt: "desc" } });
    return rows.map((r) => toPrescriptionDto(r, audience));
  }

  private async getOwned(ctx: ResolvedProviderContext, petId: string, prescriptionId: string) {
    const existing = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!existing || existing.petId !== petId) throw new PrescriptionNotFoundException({ prescriptionId });
    if (existing.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "NOT_PRESCRIBER" });
    return existing;
  }

  /**
   * Cancelling stops the regimen: the prescription becomes CANCELLED with a
   * reason, and the Medication row it created (if any) moves to HISTORICAL so
   * the owner's list stops showing a drug they were told to stop. Neither row
   * is deleted.
   */
  async cancel(ctx: ResolvedProviderContext, prescriptionId: string, dto: CancelPrescriptionDto): Promise<PrescriptionDto> {
    const existing = await this.getOwned(ctx, dto.petId, prescriptionId);
    if (existing.status !== PrescriptionStatus.ACTIVE) {
      throw new InvalidPrescriptionTransitionException({ prescriptionId, status: existing.status, action: "cancel" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.prescription.updateMany({
        where: { id: prescriptionId, status: PrescriptionStatus.ACTIVE },
        data: { status: PrescriptionStatus.CANCELLED, cancelledAt: new Date(), cancelledReason: dto.reason },
      });
      if (claimed.count === 0) throw new InvalidPrescriptionTransitionException({ prescriptionId, status: existing.status, action: "cancel" });

      if (existing.medicationId) {
        await tx.medication.update({ where: { id: existing.medicationId }, data: { status: MedicationStatus.HISTORICAL } });
      }
      await this.events.publish("PrescriptionCancelled", { petId: dto.petId, prescriptionId, reason: dto.reason }, { tx, aggregateType: "Pet", aggregateId: dto.petId });
      return tx.prescription.findUniqueOrThrow({ where: { id: prescriptionId }, include: PROVIDER_ACTOR_INCLUDE });
    });

    return toPrescriptionDto(row);
  }

  /**
   * A refill is a counter increment with an audit event, claimed atomically so
   * two racing dispenses cannot both consume the last authorised refill —
   * the same claim-then-check pattern ClinicalVisitService.complete() uses.
   */
  async dispenseRefill(ctx: ResolvedProviderContext, prescriptionId: string, dto: DispenseRefillDto): Promise<PrescriptionDto> {
    const existing = await this.getOwned(ctx, dto.petId, prescriptionId);
    if (existing.status !== PrescriptionStatus.ACTIVE || existing.refillsDispensed >= existing.refillsAuthorized) {
      throw new InvalidPrescriptionTransitionException({ prescriptionId, status: existing.status, refillsDispensed: existing.refillsDispensed, refillsAuthorized: existing.refillsAuthorized, action: "refill" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.prescription.updateMany({
        where: { id: prescriptionId, status: PrescriptionStatus.ACTIVE, refillsDispensed: existing.refillsDispensed },
        data: { refillsDispensed: existing.refillsDispensed + 1 },
      });
      if (claimed.count === 0) throw new InvalidPrescriptionTransitionException({ prescriptionId, action: "refill", reason: "CONCURRENT_DISPENSE" });
      await this.events.publish(
        "PrescriptionRefillDispensed",
        { petId: dto.petId, prescriptionId, refillNumber: existing.refillsDispensed + 1, note: dto.note ?? null },
        { tx, aggregateType: "Pet", aggregateId: dto.petId },
      );
      return tx.prescription.findUniqueOrThrow({ where: { id: prescriptionId }, include: PROVIDER_ACTOR_INCLUDE });
    });

    return toPrescriptionDto(row);
  }
}
