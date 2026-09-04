import { Injectable } from "@nestjs/common";
import { Prisma, TripStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { InvalidTripTransitionException, TripNotFoundException } from "../../common/errors/api-exception";
import { toTripDto } from "./travel-mapper";
import type { CreateTripDto, TransitionTripDto, UpdateTripDto } from "./dto/travel.dto";

const TRIP_INCLUDE = { pet: true, _count: { select: { requirements: true } } } satisfies Prisma.TripInclude;

/**
 * A trip's own status is a linear "how far along is planning" state, never
 * inferred from the requirements checklist (spec: "do not infer readiness
 * from one field") — always an explicit household action via transition().
 */
const ALLOWED_TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.DRAFT]: [TripStatus.PLANNING, TripStatus.CANCELLED],
  [TripStatus.PLANNING]: [TripStatus.READY, TripStatus.DRAFT, TripStatus.CANCELLED],
  [TripStatus.READY]: [TripStatus.IN_PROGRESS, TripStatus.PLANNING, TripStatus.CANCELLED],
  [TripStatus.IN_PROGRESS]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED]: [],
};

@Injectable()
export class TripService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  private async getRaw(petId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, petId }, include: TRIP_INCLUDE });
    if (!trip) throw new TripNotFoundException({ petId, tripId });
    return trip;
  }

  async create(petId: string, createdByUserId: string, dto: CreateTripDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.findUniqueOrThrow({ where: { id: petId } });
      const created = await tx.trip.create({
        data: {
          petId,
          householdId: pet.householdId,
          createdByUserId,
          originCountry: dto.originCountry,
          originCity: dto.originCity,
          destinationCountry: dto.destinationCountry,
          destinationCity: dto.destinationCity,
          departAt: new Date(dto.departAt),
          returnAt: dto.returnAt ? new Date(dto.returnAt) : undefined,
          travelMode: dto.travelMode,
          notes: dto.notes,
        },
        include: TRIP_INCLUDE,
      });
      await this.events.publish("TripCreated", { petId, householdId: pet.householdId, tripId: created.id }, { tx, aggregateType: "Pet", aggregateId: petId });
      return created;
    });
    return toTripDto(row);
  }

  async get(petId: string, tripId: string) {
    return toTripDto(await this.getRaw(petId, tripId));
  }

  async list(petId: string) {
    const rows = await this.prisma.trip.findMany({ where: { petId }, include: TRIP_INCLUDE, orderBy: { departAt: "desc" } });
    return rows.map(toTripDto);
  }

  async update(petId: string, tripId: string, dto: UpdateTripDto) {
    await this.getRaw(petId, tripId);
    const row = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        originCity: dto.originCity,
        destinationCity: dto.destinationCity,
        departAt: dto.departAt ? new Date(dto.departAt) : undefined,
        returnAt: dto.returnAt ? new Date(dto.returnAt) : undefined,
        travelMode: dto.travelMode,
        notes: dto.notes,
      },
      include: TRIP_INCLUDE,
    });
    return toTripDto(row);
  }

  async transition(petId: string, tripId: string, dto: TransitionTripDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.trip.findFirst({ where: { id: tripId, petId } });
      if (!existing) throw new TripNotFoundException({ petId, tripId });
      if (!ALLOWED_TRIP_TRANSITIONS[existing.status].includes(dto.status)) {
        throw new InvalidTripTransitionException({ tripId, from: existing.status, to: dto.status });
      }
      const updated = await tx.trip.update({ where: { id: tripId }, data: { status: dto.status }, include: TRIP_INCLUDE });
      await this.events.publish("TripStatusChanged", { petId, tripId, from: existing.status, to: dto.status }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toTripDto(row);
  }
}
