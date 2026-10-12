import { Injectable } from "@nestjs/common";
import { BookingStatus, ClinicalVisitStatus, PetMemoryType, TripStatus } from "@prisma/client";
import type { PetYearReviewDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isHouseholdMember } from "../../common/auth/household-member";
import { parseDayRange, dayKey } from "../../common/dates/day-range";
import { PetAccessDeniedException } from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";

const HIGHLIGHTS = 3;
const TOP_TYPES = 3;
/** A visit that happened: drafts never started and voided visits are not part of the pet's year. */
const HELD_VISITS: ClinicalVisitStatus[] = [ClinicalVisitStatus.IN_PROGRESS, ClinicalVisitStatus.COMPLETED, ClinicalVisitStatus.AMENDED];
const TAKEN_TRIPS: TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.COMPLETED];

function countBy<T extends string>(values: T[]): { key: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Derived on every call from the source rows — nothing is stored. Each section obeys the permission
 * that already governs its own domain, and household-private sections (services, trips) also require
 * membership of the pet's household, so a vet's temporary grant only ever sees memories.
 */
@Injectable()
export class PetYearReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petAccess: PetAccessService,
  ) {}

  async get(petId: string, userId: string, query: { from?: string; to?: string }): Promise<PetYearReviewDto> {
    const { from, to, toExclusive } = parseDayRange(query);
    const [pet, access] = await Promise.all([
      this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } }),
      this.petAccess.getEffectivePermissions(petId, userId),
    ]);
    if (!access) throw new PetAccessDeniedException({ petId });
    const member = await isHouseholdMember(this.prisma, pet.householdId, userId);
    const inRange = { gte: from, lt: toExclusive };

    const [memories, care, bookings, trips, visits] = await Promise.all([
      this.prisma.petMemory.findMany({
        where: { petId, archivedAt: null, occurredAt: inRange },
        select: { id: true, title: true, type: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
      }),
      access.canViewCareProfile
        ? this.prisma.careReminder.findMany({ where: { petId, state: "COMPLETED", completedAt: inRange }, select: { type: true } })
        : null,
      member
        ? this.prisma.booking.findMany({ where: { petId, householdId: pet.householdId, bookingStatus: BookingStatus.COMPLETED, startAt: inRange }, select: { category: true } })
        : null,
      member
        ? this.prisma.trip.findMany({ where: { petId, status: { in: TAKEN_TRIPS }, departAt: inRange }, select: { destinationCity: true, destinationCountry: true }, orderBy: { departAt: "asc" } })
        : null,
      access.canViewHealth ? this.prisma.clinicalVisit.count({ where: { petId, status: { in: HELD_VISITS }, startedAt: inRange } }) : null,
    ]);

    return {
      from: dayKey(from),
      to: dayKey(to),
      memories: {
        total: memories.length,
        photos: memories.filter((m) => m.type === PetMemoryType.PHOTO).length,
        highlights: memories
          .filter((m): m is typeof m & { title: string } => Boolean(m.title?.trim()))
          .slice(0, HIGHLIGHTS)
          .map((m) => ({ id: m.id, title: m.title, occurredAt: m.occurredAt.toISOString() })),
      },
      care: care ? { completed: care.length, topTypes: countBy(care.map((c) => c.type)).slice(0, TOP_TYPES).map(({ key, count }) => ({ type: key, count })) } : null,
      services: bookings ? { completed: bookings.length, byCategory: countBy(bookings.map((b) => b.category)).map(({ key, count }) => ({ category: key, count })) } : null,
      trips: trips ? { count: trips.length, destinations: [...new Set(trips.map((t) => t.destinationCity?.trim() || t.destinationCountry))] } : null,
      health: visits === null ? null : { visits },
    };
  }
}
