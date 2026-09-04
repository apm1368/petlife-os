import { Injectable } from "@nestjs/common";
import { ClinicalVisitStatus } from "@prisma/client";
import type { ClinicalVisitDetailDto, ClinicalVisitDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ClinicalVisitNotFoundException, InvalidClinicalVisitTransitionException, ProviderAccessDeniedException } from "../../common/errors/api-exception";
import { CLINICAL_VISIT_INCLUDE, toClinicalVisitDetailDto, toClinicalVisitDto } from "./clinical-health-mapper";
import type { AmendClinicalVisitDto, StartClinicalVisitDto, UpdateClinicalVisitNotesDto, VoidClinicalVisitDto } from "./dto/clinical-visit.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

/**
 * Clinical OS core. Booking = commercial/scheduling state; ClinicalVisit =
 * care-documentation state — the two are never collapsed (locked
 * principle). This phase never produces a standalone DRAFT row: `start()`
 * creates directly at IN_PROGRESS (spec Flow E: "provider starts visit" is
 * one action) — DRAFT remains in the state machine for a future
 * multi-step-drafting phase but is not reachable via this API yet.
 *
 * Completed-visit immutability: notes can be freely edited while
 * IN_PROGRESS, but once COMPLETED, `updateNotes` is rejected outright —
 * only `amend()` can change a completed visit's content, and it always
 * snapshots the prior state into ClinicalVisitRevision first (spec: "Do not
 * allow silent editing after completion... amendments must retain
 * revision/audit history").
 */
@Injectable()
export class ClinicalVisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  private async getRaw(petId: string, visitId: string) {
    const row = await this.prisma.clinicalVisit.findUnique({ where: { id: visitId }, include: CLINICAL_VISIT_INCLUDE });
    if (!row || row.petId !== petId) throw new ClinicalVisitNotFoundException({ visitId });
    return row;
  }

  /** Only the organization that opened a visit may mutate it — a different provider organization with its own (unrelated) access to the same pet must never see or alter another org's clinical record. */
  private assertOwningOrganization(visit: { providerOrganizationId: string }, ctx: ResolvedProviderContext): void {
    if (visit.providerOrganizationId !== ctx.organizationId) {
      throw new ProviderAccessDeniedException({ reason: "NOT_VISIT_OWNER" });
    }
  }

  async start(ctx: ResolvedProviderContext, dto: StartClinicalVisitDto): Promise<ClinicalVisitDto> {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: dto.petId } });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalVisit.create({
        data: {
          petId: dto.petId,
          householdId: pet.householdId,
          bookingId: dto.bookingId,
          providerOrganizationId: ctx.organizationId,
          providerUserId: ctx.providerUserId,
          reasonForVisit: dto.reasonForVisit,
          status: ClinicalVisitStatus.IN_PROGRESS,
        },
        include: CLINICAL_VISIT_INCLUDE,
      });
      await this.events.publish("ClinicalVisitStarted", { petId: dto.petId, visitId: created.id }, { tx, aggregateType: "Pet", aggregateId: dto.petId });
      return created;
    });
    return toClinicalVisitDto(row);
  }

  async list(petId: string): Promise<ClinicalVisitDto[]> {
    const rows = await this.prisma.clinicalVisit.findMany({ where: { petId }, include: CLINICAL_VISIT_INCLUDE, orderBy: { startedAt: "desc" } });
    return rows.map(toClinicalVisitDto);
  }

  async get(petId: string, visitId: string): Promise<ClinicalVisitDetailDto> {
    const row = await this.prisma.clinicalVisit.findUnique({ where: { id: visitId }, include: { ...CLINICAL_VISIT_INCLUDE, revisions: { orderBy: { revisionNumber: "asc" } } } });
    if (!row || row.petId !== petId) throw new ClinicalVisitNotFoundException({ visitId });
    return toClinicalVisitDetailDto(row);
  }

  async updateNotes(ctx: ResolvedProviderContext, petId: string, visitId: string, dto: UpdateClinicalVisitNotesDto): Promise<ClinicalVisitDto> {
    const existing = await this.getRaw(petId, visitId);
    this.assertOwningOrganization(existing, ctx);
    if (existing.status !== ClinicalVisitStatus.DRAFT && existing.status !== ClinicalVisitStatus.IN_PROGRESS) {
      throw new InvalidClinicalVisitTransitionException({ visitId, status: existing.status, action: "updateNotes" });
    }

    const row = await this.prisma.clinicalVisit.update({ where: { id: visitId }, data: dto, include: CLINICAL_VISIT_INCLUDE });
    return toClinicalVisitDto(row);
  }

  async complete(ctx: ResolvedProviderContext, petId: string, visitId: string): Promise<ClinicalVisitDto> {
    const existing = await this.getRaw(petId, visitId);
    this.assertOwningOrganization(existing, ctx);
    if (existing.status !== ClinicalVisitStatus.IN_PROGRESS && existing.status !== ClinicalVisitStatus.DRAFT) {
      throw new InvalidClinicalVisitTransitionException({ visitId, status: existing.status, action: "complete" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.clinicalVisit.updateMany({
        where: { id: visitId, status: { in: [ClinicalVisitStatus.IN_PROGRESS, ClinicalVisitStatus.DRAFT] } },
        data: { status: ClinicalVisitStatus.COMPLETED, completedAt: new Date() },
      });
      if (claimed.count === 0) throw new InvalidClinicalVisitTransitionException({ visitId, status: existing.status, action: "complete" });
      const updated = await tx.clinicalVisit.findUniqueOrThrow({ where: { id: visitId }, include: CLINICAL_VISIT_INCLUDE });
      await this.events.publish("ClinicalVisitCompleted", { petId, visitId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toClinicalVisitDto(row);
  }

  /**
   * Never edits COMPLETED content in place — snapshots the pre-amendment
   * state as a new ClinicalVisitRevision row (revisionNumber increments per
   * visit), then applies the new content and sets status AMENDED.
   */
  async amend(ctx: ResolvedProviderContext, petId: string, visitId: string, dto: AmendClinicalVisitDto): Promise<ClinicalVisitDetailDto> {
    const existing = await this.getRaw(petId, visitId);
    this.assertOwningOrganization(existing, ctx);
    if (existing.status !== ClinicalVisitStatus.COMPLETED && existing.status !== ClinicalVisitStatus.AMENDED) {
      throw new InvalidClinicalVisitTransitionException({ visitId, status: existing.status, action: "amend" });
    }

    await this.prisma.$transaction(async (tx) => {
      const lastRevision = await tx.clinicalVisitRevision.findFirst({ where: { clinicalVisitId: visitId }, orderBy: { revisionNumber: "desc" } });
      await tx.clinicalVisitRevision.create({
        data: {
          clinicalVisitId: visitId,
          revisionNumber: (lastRevision?.revisionNumber ?? 0) + 1,
          snapshotStatus: existing.status,
          snapshotReasonForVisit: existing.reasonForVisit,
          snapshotHistoryText: existing.historyText,
          snapshotObservationsText: existing.observationsText,
          snapshotAssessmentText: existing.assessmentText,
          snapshotPlanText: existing.planText,
          amendedByProviderUserId: ctx.providerUserId,
          reason: dto.reason,
        },
      });
      await tx.clinicalVisit.update({
        where: { id: visitId },
        data: {
          status: ClinicalVisitStatus.AMENDED,
          reasonForVisit: dto.reasonForVisit ?? existing.reasonForVisit,
          historyText: dto.historyText ?? existing.historyText,
          observationsText: dto.observationsText ?? existing.observationsText,
          assessmentText: dto.assessmentText ?? existing.assessmentText,
          planText: dto.planText ?? existing.planText,
        },
      });
      await this.events.publish("ClinicalVisitAmended", { petId, visitId, reason: dto.reason }, { tx, aggregateType: "Pet", aggregateId: petId });
    });
    return this.get(petId, visitId);
  }

  async voidVisit(ctx: ResolvedProviderContext, petId: string, visitId: string, dto: VoidClinicalVisitDto): Promise<ClinicalVisitDto> {
    const existing = await this.getRaw(petId, visitId);
    this.assertOwningOrganization(existing, ctx);
    if (existing.status === ClinicalVisitStatus.VOIDED) {
      throw new InvalidClinicalVisitTransitionException({ visitId, status: existing.status, action: "void" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.clinicalVisit.updateMany({
        where: { id: visitId, status: { not: ClinicalVisitStatus.VOIDED } },
        data: { status: ClinicalVisitStatus.VOIDED },
      });
      if (claimed.count === 0) throw new InvalidClinicalVisitTransitionException({ visitId, status: existing.status, action: "void" });
      const updated = await tx.clinicalVisit.findUniqueOrThrow({ where: { id: visitId }, include: CLINICAL_VISIT_INCLUDE });
      await tx.clinicalVisitRevision.create({
        data: {
          clinicalVisitId: visitId,
          revisionNumber: ((await tx.clinicalVisitRevision.count({ where: { clinicalVisitId: visitId } })) ?? 0) + 1,
          snapshotStatus: existing.status,
          snapshotReasonForVisit: existing.reasonForVisit,
          snapshotHistoryText: existing.historyText,
          snapshotObservationsText: existing.observationsText,
          snapshotAssessmentText: existing.assessmentText,
          snapshotPlanText: existing.planText,
          amendedByProviderUserId: ctx.providerUserId,
          reason: dto.reason,
        },
      });
      await this.events.publish("ClinicalVisitVoided", { petId, visitId, reason: dto.reason }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toClinicalVisitDto(row);
  }
}
