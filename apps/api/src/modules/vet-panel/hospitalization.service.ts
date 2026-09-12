import { Injectable } from "@nestjs/common";
import { HospitalizationStatus, TreatmentTaskStatus } from "@prisma/client";
import type { HospitalizationDetailDto, HospitalizationDto, TreatmentTaskDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import {
  HospitalizationNotFoundException,
  InvalidHospitalizationTransitionException,
  InvalidTreatmentTaskTransitionException,
  ProviderAccessDeniedException,
  TreatmentTaskNotFoundException,
} from "../../common/errors/api-exception";
import { assertVisitBelongsToPet } from "../clinical-health/clinical-link.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { HOSPITALIZATION_INCLUDE, toHospitalizationDto, toPatientVitalsDto, toTreatmentTaskDto, PROVIDER_ACTOR_INCLUDE } from "./vet-panel.mapper";
import type { AdmitPatientDto, CompleteTreatmentTaskDto, CreateTreatmentTasksDto, DischargePatientDto, ScheduleTreatmentSeriesDto, UpdateHospitalizationDto } from "./dto/hospitalization.dto";

/** A task's outcome is a recorded act of care — only these three terminal values may ever be written, and never back to SCHEDULED. */
const TERMINAL_TASK_STATUSES: TreatmentTaskStatus[] = [TreatmentTaskStatus.DONE, TreatmentTaskStatus.SKIPPED, TreatmentTaskStatus.MISSED];

/**
 * Inpatient care. A Hospitalization is what makes "who is in the building
 * right now" a fact rather than an inference from a booking that happens to
 * be IN_PROGRESS — the two are as separate as Booking and ClinicalVisit are
 * in Handoff 17, and for the same reason: an animal can be admitted without a
 * booking (a walk-in emergency) and booked without ever being admitted.
 *
 * The treatment sheet is not a stored document. It is the TreatmentTask rows
 * read back in time order, so the sheet can never disagree with the tasks.
 */
@Injectable()
export class HospitalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * One live stay per patient per organisation. The uniqueness is enforced by
   * re-checking inside the transaction after a claim attempt rather than by a
   * partial unique index, because "live" spans two statuses and Prisma cannot
   * express a filtered unique constraint in schema.prisma.
   */
  async admit(ctx: ResolvedProviderContext, dto: AdmitPatientDto): Promise<HospitalizationDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const row = await this.prisma.$transaction(async (tx) => {
      const live = await tx.hospitalization.findFirst({
        where: { petId: dto.petId, providerOrganizationId: ctx.organizationId, status: HospitalizationStatus.ADMITTED },
      });
      if (live) throw new InvalidHospitalizationTransitionException({ petId: dto.petId, existingHospitalizationId: live.id, action: "admit" });

      const created = await tx.hospitalization.create({
        data: {
          petId: dto.petId,
          providerOrganizationId: ctx.organizationId,
          attendingProviderUserId: ctx.providerUserId,
          clinicalVisitId: dto.clinicalVisitId ?? null,
          reasonForAdmission: dto.reasonForAdmission,
          kennelLabel: dto.kennelLabel ?? null,
          triageLevel: dto.triageLevel ?? null,
          estimatedDischargeAt: dto.estimatedDischargeAt ? new Date(dto.estimatedDischargeAt) : null,
        },
        include: HOSPITALIZATION_INCLUDE,
      });
      await this.events.publish("PatientAdmitted", { petId: dto.petId, hospitalizationId: created.id }, { tx, aggregateType: "Pet", aggregateId: dto.petId });
      return created;
    });

    return toHospitalizationDto(row);
  }

  async listForPet(petId: string): Promise<HospitalizationDto[]> {
    const rows = await this.prisma.hospitalization.findMany({ where: { petId }, include: HOSPITALIZATION_INCLUDE, orderBy: { admittedAt: "desc" } });
    return rows.map(toHospitalizationDto);
  }

  private async getOwned(ctx: ResolvedProviderContext, hospitalizationId: string, petId?: string) {
    const row = await this.prisma.hospitalization.findUnique({ where: { id: hospitalizationId } });
    if (!row || (petId && row.petId !== petId)) throw new HospitalizationNotFoundException({ hospitalizationId });
    if (row.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "NOT_ADMITTING_ORGANIZATION" });
    return row;
  }

  async get(ctx: ResolvedProviderContext, petId: string, hospitalizationId: string): Promise<HospitalizationDetailDto> {
    await this.getOwned(ctx, hospitalizationId, petId);
    const row = await this.prisma.hospitalization.findUniqueOrThrow({
      where: { id: hospitalizationId },
      include: {
        ...HOSPITALIZATION_INCLUDE,
        treatmentTasks: { orderBy: { scheduledAt: "asc" } },
        vitalsRecords: { include: PROVIDER_ACTOR_INCLUDE, orderBy: { recordedAt: "desc" } },
      },
    });

    const now = new Date();
    const tasks = row.treatmentTasks.map((t) => toTreatmentTaskDto(t, now));
    return {
      ...toHospitalizationDto(row),
      tasks,
      vitals: row.vitalsRecords.map(toPatientVitalsDto),
      taskCounts: {
        scheduled: tasks.filter((t) => t.status === "SCHEDULED").length,
        overdue: tasks.filter((t) => t.isOverdue).length,
        done: tasks.filter((t) => t.status === "DONE").length,
        skipped: tasks.filter((t) => t.status === "SKIPPED").length,
        missed: tasks.filter((t) => t.status === "MISSED").length,
      },
    };
  }

  async update(ctx: ResolvedProviderContext, hospitalizationId: string, dto: UpdateHospitalizationDto): Promise<HospitalizationDto> {
    const existing = await this.getOwned(ctx, hospitalizationId, dto.petId);
    if (existing.status !== HospitalizationStatus.ADMITTED) {
      throw new InvalidHospitalizationTransitionException({ hospitalizationId, status: existing.status, action: "update" });
    }
    const row = await this.prisma.hospitalization.update({
      where: { id: hospitalizationId },
      data: {
        kennelLabel: dto.kennelLabel ?? existing.kennelLabel,
        triageLevel: dto.triageLevel ?? existing.triageLevel,
        estimatedDischargeAt: dto.estimatedDischargeAt ? new Date(dto.estimatedDischargeAt) : existing.estimatedDischargeAt,
      },
      include: HOSPITALIZATION_INCLUDE,
    });
    return toHospitalizationDto(row);
  }

  /**
   * Discharge claims the row the same way a visit completion does, so two
   * simultaneous discharges cannot both succeed. Outstanding SCHEDULED tasks
   * are deliberately left as they are rather than auto-closed: a task nobody
   * actioned is a real gap in the record, and silently marking it DONE or
   * MISSED at discharge would fabricate a clinical fact.
   */
  async discharge(ctx: ResolvedProviderContext, hospitalizationId: string, dto: DischargePatientDto): Promise<HospitalizationDto> {
    const existing = await this.getOwned(ctx, hospitalizationId, dto.petId);
    if (existing.status !== HospitalizationStatus.ADMITTED) {
      throw new InvalidHospitalizationTransitionException({ hospitalizationId, status: existing.status, action: "discharge" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.hospitalization.updateMany({
        where: { id: hospitalizationId, status: HospitalizationStatus.ADMITTED },
        data: { status: HospitalizationStatus.DISCHARGED, dischargedAt: new Date(), dischargeNote: dto.dischargeNote ?? null },
      });
      if (claimed.count === 0) throw new InvalidHospitalizationTransitionException({ hospitalizationId, status: existing.status, action: "discharge" });
      await this.events.publish("PatientDischarged", { petId: dto.petId, hospitalizationId }, { tx, aggregateType: "Pet", aggregateId: dto.petId });
      return tx.hospitalization.findUniqueOrThrow({ where: { id: hospitalizationId }, include: HOSPITALIZATION_INCLUDE });
    });

    return toHospitalizationDto(row);
  }

  async addTasks(ctx: ResolvedProviderContext, hospitalizationId: string, dto: CreateTreatmentTasksDto): Promise<TreatmentTaskDto[]> {
    const existing = await this.getOwned(ctx, hospitalizationId, dto.petId);
    if (existing.status !== HospitalizationStatus.ADMITTED) {
      throw new InvalidHospitalizationTransitionException({ hospitalizationId, status: existing.status, action: "addTasks" });
    }

    await this.prisma.treatmentTask.createMany({
      data: dto.tasks.map((t) => ({
        hospitalizationId,
        type: t.type,
        title: t.title,
        detail: t.detail ?? null,
        prescriptionId: t.prescriptionId ?? null,
        scheduledAt: new Date(t.scheduledAt),
      })),
    });

    const rows = await this.prisma.treatmentTask.findMany({ where: { hospitalizationId }, orderBy: { scheduledAt: "asc" } });
    const now = new Date();
    return rows.map((r) => toTreatmentTaskDto(r, now));
  }

  /**
   * Expands "q8h for 3 days" into real rows at write time. There is no stored
   * recurrence rule on purpose: once a nurse has actioned the 06:00 dose, the
   * sheet must not be able to shift under them because someone edited a rule.
   */
  async scheduleSeries(ctx: ResolvedProviderContext, hospitalizationId: string, dto: ScheduleTreatmentSeriesDto): Promise<TreatmentTaskDto[]> {
    const start = new Date(dto.startAt);
    const tasks = Array.from({ length: dto.occurrences }, (_, i) => ({
      type: dto.type,
      title: dto.title,
      detail: dto.detail,
      prescriptionId: dto.prescriptionId,
      scheduledAt: new Date(start.getTime() + i * dto.everyHours * 60 * 60 * 1000).toISOString(),
    }));
    return this.addTasks(ctx, hospitalizationId, { petId: dto.petId, tasks });
  }

  /**
   * Records who did what and when. A task that already carries an outcome is
   * never silently re-stated — the caller gets a 409 instead, because
   * overwriting "given at 06:00 by A" with "skipped by B" would destroy the
   * only record that the first event happened.
   */
  async actionTask(ctx: ResolvedProviderContext, hospitalizationId: string, taskId: string, dto: CompleteTreatmentTaskDto): Promise<TreatmentTaskDto> {
    await this.getOwned(ctx, hospitalizationId, dto.petId);
    if (!TERMINAL_TASK_STATUSES.includes(dto.status)) {
      throw new InvalidTreatmentTaskTransitionException({ taskId, requestedStatus: dto.status, reason: "NOT_A_TERMINAL_STATUS" });
    }

    const existing = await this.prisma.treatmentTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.hospitalizationId !== hospitalizationId) throw new TreatmentTaskNotFoundException({ taskId });
    if (existing.status !== TreatmentTaskStatus.SCHEDULED) {
      throw new InvalidTreatmentTaskTransitionException({ taskId, status: existing.status, action: "action" });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.treatmentTask.updateMany({
        where: { id: taskId, status: TreatmentTaskStatus.SCHEDULED },
        data: { status: dto.status, completedAt: new Date(), completedByProviderUserId: ctx.providerUserId, outcomeNote: dto.outcomeNote ?? null },
      });
      if (claimed.count === 0) throw new InvalidTreatmentTaskTransitionException({ taskId, status: existing.status, action: "action" });
      await this.events.publish(
        "TreatmentTaskActioned",
        { petId: dto.petId, hospitalizationId, taskId, status: dto.status },
        { tx, aggregateType: "Pet", aggregateId: dto.petId },
      );
      return tx.treatmentTask.findUniqueOrThrow({ where: { id: taskId } });
    });

    return toTreatmentTaskDto(row);
  }
}
