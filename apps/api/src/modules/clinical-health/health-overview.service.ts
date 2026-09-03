import { Injectable } from "@nestjs/common";
import { CarePlanItemStatus, ClinicalVisitStatus, MedicationStatus, SetupStatus } from "@prisma/client";
import type { HealthOverviewDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { CareCalendarService } from "../care-calendar/care-calendar.service";
import { MEDICAL_DOCUMENT_INCLUDE, toMedicalDocumentDto } from "./clinical-health-mapper";
import { toClinicalVisitDto } from "./clinical-health-mapper";

/**
 * Answers "what matters for this pet right now" (spec). Deliberately no
 * numeric health score anywhere in this DTO — spec: "if a score cannot be
 * responsibly calculated, do not show one." `missingInformation` names gaps
 * explicitly rather than defaulting to a falsely reassuring empty state.
 */
@Injectable()
export class HealthOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly careCalendar: CareCalendarService,
  ) {}

  async get(petId: string): Promise<HealthOverviewDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    const now = new Date();
    const [calendarEvents, activeMedicationsCount, unresolvedCarePlanItemsCount, recentDocumentRows, recentVisitRows, healthProfile, vaccinationSummary] = await Promise.all([
      this.careCalendar.listUpcoming([pet.householdId], petId),
      this.prisma.medication.count({ where: { petId, status: MedicationStatus.ACTIVE } }),
      this.prisma.carePlanItem.count({ where: { carePlan: { petId }, status: { in: [CarePlanItemStatus.PENDING, CarePlanItemStatus.ACTIVE] } } }),
      this.prisma.medicalDocument.findMany({ where: { petId, voidedAt: null }, include: MEDICAL_DOCUMENT_INCLUDE, orderBy: { uploadedAt: "desc" }, take: 5 }),
      this.prisma.clinicalVisit.findMany({
        where: { petId, status: { in: [ClinicalVisitStatus.COMPLETED, ClinicalVisitStatus.AMENDED] } },
        include: { providerOrganization: { select: { id: true, name: true } }, providerUser: { select: { id: true, displayTitle: true } } },
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
      this.prisma.healthProfile.findUnique({ where: { petId } }),
      this.prisma.vaccinationSummary.findUnique({ where: { petId } }),
    ]);

    const upcomingCare = calendarEvents.filter((e) => new Date(e.startAt) >= now);
    const overdueCare = calendarEvents.filter((e) => new Date(e.startAt) < now);

    const missingInformation: string[] = [];
    if (!healthProfile || healthProfile.status === SetupStatus.NOT_STARTED) missingInformation.push("Health Basics not started");
    else if (healthProfile.status === SetupStatus.PARTIAL) missingInformation.push("Health Basics incomplete");
    if (!vaccinationSummary || vaccinationSummary.status === "INCOMPLETE") missingInformation.push("Vaccination status not recorded");

    return {
      petId,
      upcomingCare,
      overdueCare,
      activeMedicationsCount,
      unresolvedCarePlanItemsCount,
      recentDocuments: recentDocumentRows.map(toMedicalDocumentDto),
      recentVisits: recentVisitRows.map(toClinicalVisitDto),
      missingInformation,
    };
  }
}
