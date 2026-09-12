import { Injectable } from "@nestjs/common";
import { BookingStatus, CarePlanItemStatus, CarePlanItemType, ClinicalEstimateStatus, ClinicalVisitStatus, HospitalizationStatus, ServiceCategory, TreatmentTaskStatus } from "@prisma/client";
import type { ClinicalDashboardDto, WhiteboardPatientDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CLINICAL_VISIT_INCLUDE, toCarePlanItemDto, toClinicalVisitDto } from "../clinical-health/clinical-health-mapper";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ESTIMATE_INCLUDE, HOSPITALIZATION_INCLUDE, toClinicalEstimateDto, toHospitalizationDto, toTreatmentTaskDto } from "./vet-panel.mapper";

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS];

/**
 * The clinical whiteboard. Everything here is a live read over rows that
 * already exist — there is no stored board, no cached counts, and nothing is
 * "derived" in a way that could disagree with the underlying record.
 *
 * Deliberately operational only, matching ProviderOverviewService's own bar
 * from Handoff 05: what needs a clinician in the next few hours. No revenue,
 * no lifetime totals, no productivity metrics per vet — a clinical board that
 * doubles as a performance dashboard changes how people record care.
 *
 * "Today" uses UTC calendar-day boundaries, the same documented simplification
 * ProviderOverviewService already makes (see README Known limitations).
 */
@Injectable()
export class ClinicalDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(ctx: ResolvedProviderContext): Promise<ClinicalDashboardDto> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [todaysVetBookingCount, openVisitRows, hospitalizations, overdueTaskRows, pendingEstimateRows, unresolvedAlertCount, dueFollowUpRows] = await Promise.all([
      this.prisma.booking.count({
        where: { providerOrganizationId: ctx.organizationId, category: ServiceCategory.VET, startAt: { gte: todayStart, lt: todayEnd }, bookingStatus: { in: ACTIVE_BOOKING_STATUSES } },
      }),
      this.prisma.clinicalVisit.findMany({
        where: { providerOrganizationId: ctx.organizationId, status: { in: [ClinicalVisitStatus.DRAFT, ClinicalVisitStatus.IN_PROGRESS] } },
        include: CLINICAL_VISIT_INCLUDE,
        orderBy: { startedAt: "asc" },
      }),
      this.prisma.hospitalization.findMany({
        where: { providerOrganizationId: ctx.organizationId, status: HospitalizationStatus.ADMITTED },
        include: {
          ...HOSPITALIZATION_INCLUDE,
          treatmentTasks: { where: { status: TreatmentTaskStatus.SCHEDULED }, orderBy: { scheduledAt: "asc" } },
          vitalsRecords: { orderBy: { recordedAt: "desc" }, take: 1, select: { recordedAt: true } },
        },
        orderBy: { admittedAt: "asc" },
      }),
      this.prisma.treatmentTask.findMany({
        where: {
          status: TreatmentTaskStatus.SCHEDULED,
          scheduledAt: { lt: now },
          hospitalization: { providerOrganizationId: ctx.organizationId, status: HospitalizationStatus.ADMITTED },
        },
        orderBy: { scheduledAt: "asc" },
        take: 50,
      }),
      this.prisma.clinicalEstimate.findMany({
        where: { providerOrganizationId: ctx.organizationId, status: ClinicalEstimateStatus.PRESENTED },
        include: ESTIMATE_INCLUDE,
        orderBy: { presentedAt: "asc" },
        take: 20,
      }),
      this.prisma.providerClinicalAlert.count({ where: { providerOrganizationId: ctx.organizationId, resolvedAt: null } }),
      this.prisma.carePlanItem.findMany({
        where: {
          type: CarePlanItemType.FOLLOW_UP,
          status: { in: [CarePlanItemStatus.PENDING, CarePlanItemStatus.ACTIVE] },
          dueAt: { lte: todayEnd },
          carePlan: { providerOrganizationId: ctx.organizationId },
        },
        orderBy: { dueAt: "asc" },
        take: 20,
      }),
    ]);

    const whiteboard: WhiteboardPatientDto[] = hospitalizations.map((h) => {
      const scheduled = h.treatmentTasks;
      return {
        hospitalization: toHospitalizationDto(h),
        dueTaskCount: scheduled.length,
        overdueTaskCount: scheduled.filter((t) => t.scheduledAt.getTime() < now.getTime()).length,
        nextTaskAt: scheduled[0]?.scheduledAt.toISOString() ?? null,
        latestVitalsAt: h.vitalsRecords[0]?.recordedAt.toISOString() ?? null,
      };
    });

    return {
      organizationId: ctx.organizationId,
      todaysVetBookingCount,
      openVisits: openVisitRows.map(toClinicalVisitDto),
      whiteboard,
      overdueTreatmentTasks: overdueTaskRows.map((t) => toTreatmentTaskDto(t, now)),
      pendingEstimates: pendingEstimateRows.map(toClinicalEstimateDto),
      unresolvedAlertCount,
      dueFollowUps: dueFollowUpRows.map(toCarePlanItemDto),
    };
  }
}
