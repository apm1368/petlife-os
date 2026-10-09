import { Injectable } from "@nestjs/common";
import {
  CareCalendarEventStatus,
  CarePlanItemStatus,
  ClinicalVisitStatus,
  SetupStatus,
  VaccinationStatus,
} from "@prisma/client";
import type {
  PetAccessFlags,
  PetDto,
  PetOverviewAttentionDto,
  PetOverviewDto,
  PetOverviewEventDto,
} from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";

@Injectable()
export class PetOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async get(petId: string, access: PetAccessFlags): Promise<PetOverviewDto> {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      include: { household: { select: { name: true } } },
    });
    if (!pet) throw new NotFoundApiException("Pet");

    const now = new Date();
    const [memory, calendar, health] = await Promise.all([
      this.prisma.petMemory.findFirst({
        where: { petId, archivedAt: null },
        orderBy: { occurredAt: "desc" },
        select: { id: true, title: true, occurredAt: true, type: true },
      }),
      access.canBookCare || access.canViewCareProfile
        ? this.prisma.careCalendarEvent.findMany({
            where: { petId, status: { not: CareCalendarEventStatus.CANCELLED }, endAt: { gte: now } },
            orderBy: { startAt: "asc" },
            take: 8,
          })
        : Promise.resolve([]),
      access.canViewHealth ? this.getHealthReadModel(petId, now) : Promise.resolve(null),
    ]);

    const attention: PetOverviewAttentionDto[] = [];
    const upcoming: PetOverviewEventDto[] = calendar.map((event) => ({
      id: event.id,
      type: "BOOKING",
      title: event.titleKey,
      occurredAt: event.startAt.toISOString(),
      sourceType: null,
      providerName: null,
      href: "/bookings/" + event.sourceId,
      status: event.status,
    }));
    const recentHealth: PetOverviewEventDto[] = [];
    const recentActivity: PetOverviewEventDto[] = [];

    if (health) {
      if (health.vaccination?.status === VaccinationStatus.OVERDUE) {
        attention.push({
          id: "vaccination-overdue",
          severity: "CONCERN",
          title: "VACCINATION_OVERDUE",
          dueAt: health.vaccination.nextDueDate?.toISOString() ?? null,
          href: "/health/vaccination",
        });
      } else if (health.vaccination?.status === VaccinationStatus.DUE_SOON) {
        attention.push({
          id: "vaccination-due",
          severity: "ATTENTION",
          title: "VACCINATION_DUE_SOON",
          dueAt: health.vaccination.nextDueDate?.toISOString() ?? null,
          href: "/health/vaccination",
        });
      }

      if (!health.healthProfile || health.healthProfile.status !== SetupStatus.COMPLETE) {
        attention.push({
          id: "health-incomplete",
          severity: "INFORMATIONAL",
          title: "HEALTH_PROFILE_INCOMPLETE",
          dueAt: null,
          href: "/health",
        });
      }

      for (const item of health.overdueItems) {
        attention.push({
          id: item.id,
          severity: "ATTENTION",
          title: item.title,
          dueAt: item.dueAt?.toISOString() ?? null,
          href: "/care?item=" + item.id,
        });
      }

      upcoming.push(...health.upcomingItems.map((item) => ({
        id: item.id,
        type: "CARE" as const,
        title: item.title,
        occurredAt: item.dueAt?.toISOString() ?? item.createdAt.toISOString(),
        sourceType: item.source as PetOverviewEventDto["sourceType"],
        providerName: item.carePlan.providerOrganization.name,
        href: "/care?item=" + item.id,
        status: item.status,
      })));

      recentHealth.push(
        ...health.visits.map((visit) => ({
          id: visit.id,
          type: "VISIT" as const,
          title: visit.reasonForVisit ?? visit.providerOrganization.name,
          occurredAt: visit.startedAt.toISOString(),
          sourceType: "PROVIDER" as PetOverviewEventDto["sourceType"],
          providerName: visit.providerOrganization.name,
          href: "/health/advanced/visits/" + visit.id,
          status: visit.status,
        })),
        ...health.labs.map((lab) => ({
          id: lab.id,
          type: "LAB" as const,
          title: lab.testName,
          occurredAt: (lab.resultDate ?? lab.createdAt).toISOString(),
          sourceType: lab.sourceType as PetOverviewEventDto["sourceType"],
          providerName: lab.providerOrganization?.name ?? null,
          href: "/health/advanced/labs?record=" + lab.id,
          status: lab.status,
        })),
        ...health.documents.map((document) => ({
          id: document.id,
          type: "DOCUMENT" as const,
          title: document.title,
          occurredAt: document.uploadedAt.toISOString(),
          sourceType: document.sourceType as PetOverviewEventDto["sourceType"],
          providerName: document.sourceProviderOrganization?.name ?? null,
          href: "/health/advanced/documents?document=" + document.id,
          status: document.verificationStatus,
        })),
      );

      recentActivity.push(...health.completedItems.map((item) => ({
        id: item.id,
        type: "CARE" as const,
        title: item.title,
        occurredAt: (item.completedAt ?? item.updatedAt).toISOString(),
        sourceType: item.source as PetOverviewEventDto["sourceType"],
        providerName: item.carePlan.providerOrganization.name,
        href: "/care?item=" + item.id,
        status: item.status,
      })));
    }

    recentHealth.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    recentActivity.push(...recentHealth.slice(0, 5));
    if (memory) {
      recentActivity.push({
        id: memory.id,
        type: "MEMORY",
        title: memory.title ?? "MEMORY",
        occurredAt: memory.occurredAt.toISOString(),
        sourceType: null,
        providerName: null,
        href: "/memories/" + memory.id,
        status: null,
      });
    }
    recentActivity.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    upcoming.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

    return {
      pet: toPetDto(pet),
      householdName: pet.household.name,
      attention: attention.slice(0, 6),
      upcoming: upcoming.slice(0, 8),
      recentHealth: recentHealth.slice(0, 8),
      recentActivity: recentActivity.slice(0, 8),
      recentMemory: memory ? { id: memory.id, title: memory.title, occurredAt: memory.occurredAt.toISOString(), type: memory.type } : null,
    };
  }

  private async getHealthReadModel(petId: string, now: Date) {
    return Promise.all([
      this.prisma.healthProfile.findUnique({ where: { petId } }),
      this.prisma.vaccinationSummary.findUnique({ where: { petId } }),
      this.prisma.carePlanItem.findMany({
        where: { carePlan: { petId }, status: { in: [CarePlanItemStatus.PENDING, CarePlanItemStatus.ACTIVE] }, dueAt: { lt: now } },
        include: { carePlan: { include: { providerOrganization: { select: { name: true } } } } },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
      this.prisma.carePlanItem.findMany({
        where: { carePlan: { petId }, status: { in: [CarePlanItemStatus.PENDING, CarePlanItemStatus.ACTIVE] }, dueAt: { gte: now } },
        include: { carePlan: { include: { providerOrganization: { select: { name: true } } } } },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
      this.prisma.carePlanItem.findMany({
        where: { carePlan: { petId }, status: CarePlanItemStatus.COMPLETED },
        include: { carePlan: { include: { providerOrganization: { select: { name: true } } } } },
        orderBy: { completedAt: "desc" },
        take: 5,
      }),
      this.prisma.clinicalVisit.findMany({
        where: { petId, status: { in: [ClinicalVisitStatus.COMPLETED, ClinicalVisitStatus.AMENDED] } },
        include: { providerOrganization: { select: { name: true } } },
        orderBy: { startedAt: "desc" },
        take: 4,
      }),
      this.prisma.labResult.findMany({
        where: { petId },
        include: { providerOrganization: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      this.prisma.medicalDocument.findMany({
        where: { petId, voidedAt: null },
        include: { sourceProviderOrganization: { select: { name: true } } },
        orderBy: { uploadedAt: "desc" },
        take: 4,
      }),
    ]).then(([healthProfile, vaccination, overdueItems, upcomingItems, completedItems, visits, labs, documents]) => ({
      healthProfile,
      vaccination,
      overdueItems,
      upcomingItems,
      completedItems,
      visits,
      labs,
      documents,
    }));
  }
}

function toPetDto(pet: {
  id: string;
  householdId: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  birthDate: Date | null;
  approximateAgeMonths: number | null;
  photoUrl: string | null;
  latestWeightValue: { toNumber(): number } | null;
  latestWeightUnit: string | null;
  colorMarkings: string | null;
  neuteredStatus: string | null;
  microchipNumber: string | null;
  lifecycleStatus: string;
  createdAt: Date;
  updatedAt: Date;
}): PetDto {
  return {
    id: pet.id,
    householdId: pet.householdId,
    name: pet.name,
    species: pet.species as PetDto["species"],
    breed: pet.breed,
    sex: pet.sex as PetDto["sex"],
    birthDate: pet.birthDate?.toISOString() ?? null,
    approximateAgeMonths: pet.approximateAgeMonths,
    photoUrl: pet.photoUrl,
    latestWeightValue: pet.latestWeightValue?.toNumber() ?? null,
    latestWeightUnit: pet.latestWeightUnit as PetDto["latestWeightUnit"],
    colorMarkings: pet.colorMarkings,
    neuteredStatus: pet.neuteredStatus as PetDto["neuteredStatus"],
    microchipNumber: pet.microchipNumber,
    lifecycleStatus: pet.lifecycleStatus as PetDto["lifecycleStatus"],
    createdAt: pet.createdAt.toISOString(),
    updatedAt: pet.updatedAt.toISOString(),
  };
}
