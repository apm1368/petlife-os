import { Injectable } from "@nestjs/common";
import { BookingStatus, Prisma } from "@prisma/client";
import {
  HealthAccessScopePreset,
  type BookingDto,
  type BookingHoldDto,
  type ProviderLocationDto,
  type ProviderServiceDto,
  type ProviderSummaryDto,
} from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import {
  BookingConflictException,
  BookingNotCancellableException,
  NotFoundApiException,
  PetAccessDeniedException,
  PetNotSupportedException,
  ProviderNotVerifiedException,
  ServiceNotAvailableException,
  SlotUnavailableException,
} from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import { SlotGeneratorService } from "../providers/slot-generator.service";
import { CareCalendarService } from "../care-calendar/care-calendar.service";
import { BookingHoldService } from "./booking-hold.service";
import { BookingHealthAccessService } from "./booking-health-access.service";
import type { CreateBookingHoldDto } from "./dto/create-booking-hold.dto";
import type { CreateBookingDto } from "./dto/create-booking.dto";
import type { CancelBookingDto } from "./dto/cancel-booking.dto";

const CANCELLABLE_STATUSES: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED];

const BOOKING_INCLUDE = {
  providerOrganization: true,
  providerLocation: true,
  providerService: true,
  healthAccess: { include: { petAccessGrant: true } },
} satisfies Prisma.BookingInclude;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toLocationDto(location: BookingWithRelations["providerLocation"]): ProviderLocationDto {
  return {
    id: location.id,
    providerOrganizationId: location.providerOrganizationId,
    name: location.name,
    addressLine: location.addressLine,
    city: location.city,
    region: location.region,
    countryCode: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
    phone: location.phone,
    timezone: location.timezone,
  };
}

function toServiceDto(service: BookingWithRelations["providerService"]): ProviderServiceDto {
  return {
    id: service.id,
    providerOrganizationId: service.providerOrganizationId,
    locationId: service.locationId,
    name: service.name,
    description: service.description,
    type: service.type as unknown as ProviderServiceDto["type"],
    durationMinutes: service.durationMinutes,
    priceAmount: service.priceAmount ? Number(service.priceAmount) : null,
    currency: service.currency,
    supportsDog: service.supportsDog,
    supportsCat: service.supportsCat,
    isActive: service.isActive,
  };
}

function toProviderSummaryDto(org: BookingWithRelations["providerOrganization"]): ProviderSummaryDto {
  return {
    id: org.id,
    name: org.name,
    type: org.type as unknown as ProviderSummaryDto["type"],
    verificationStatus: org.verificationStatus as unknown as ProviderSummaryDto["verificationStatus"],
    description: org.description,
    logoUrl: org.logoUrl,
    locations: [],
    services: [],
    nextAvailableSlotStart: null,
  };
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petAccess: PetAccessService,
    private readonly slotGenerator: SlotGeneratorService,
    private readonly bookingHold: BookingHoldService,
    private readonly healthAccess: BookingHealthAccessService,
    private readonly careCalendar: CareCalendarService,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Re-derives every fact about the requested slot from the database rather
   * than trusting the client — the pet's species, the service's active
   * status and species support, the provider's verification, and (via
   * SlotGeneratorService) that the slot is actually still AVAILABLE right
   * now. PetAccessGuard has already checked canBookCare by the time this
   * runs (see BookingsController).
   */
  async createHold(userId: string, dto: CreateBookingHoldDto): Promise<BookingHoldDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id: dto.petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    const organization = await this.prisma.providerOrganization.findUnique({ where: { id: dto.providerId } });
    if (!organization) throw new NotFoundApiException("Provider");
    if (organization.verificationStatus !== "VERIFIED") {
      throw new ProviderNotVerifiedException({ providerId: dto.providerId });
    }

    const service = await this.prisma.providerService.findUnique({ where: { id: dto.serviceId } });
    if (!service || service.providerOrganizationId !== dto.providerId) throw new NotFoundApiException("Service");
    if (!service.isActive) throw new ServiceNotAvailableException({ serviceId: dto.serviceId });

    const speciesSupported = pet.species === "DOG" ? service.supportsDog : pet.species === "CAT" ? service.supportsCat : true;
    if (!speciesSupported) throw new PetNotSupportedException({ petId: dto.petId, serviceId: dto.serviceId });

    const location = await this.prisma.providerLocation.findUnique({ where: { id: dto.locationId } });
    if (!location || location.providerOrganizationId !== dto.providerId) throw new NotFoundApiException("Location");

    const slotStart = new Date(dto.slotStart);
    const slotEnd = new Date(slotStart.getTime() + service.durationMinutes * 60_000);
    const slots = await this.slotGenerator.generate({
      providerOrganizationId: dto.providerId,
      locationId: dto.locationId,
      serviceId: dto.serviceId,
      providerUserId: dto.providerUserId,
      from: new Date(slotStart.getTime() - 60_000),
      to: new Date(slotEnd.getTime() + 60_000),
    });
    const match = slots.find((s) => s.startAt.getTime() === slotStart.getTime() && s.state === "AVAILABLE");
    if (!match) throw new SlotUnavailableException({ slotStart: dto.slotStart });

    const hold = await this.bookingHold.createHold({
      petId: pet.id,
      householdId: pet.householdId,
      userId,
      providerOrganizationId: dto.providerId,
      providerLocationId: dto.locationId,
      providerUserId: dto.providerUserId ?? match.providerUserId ?? null,
      providerServiceId: dto.serviceId,
      slotStart: slotStart.toISOString(),
      slotEnd: slotEnd.toISOString(),
      timezone: match.timezone,
    });

    await this.events.publish("BookingHoldCreated", { holdId: hold.holdId, petId: pet.id, providerId: dto.providerId });

    return {
      holdId: hold.holdId,
      expiresAt: hold.expiresAt,
      petId: hold.petId,
      providerOrganizationId: hold.providerOrganizationId,
      providerLocationId: hold.providerLocationId,
      providerUserId: hold.providerUserId,
      providerServiceId: hold.providerServiceId,
      slotStart: hold.slotStart,
      slotEnd: hold.slotEnd,
      timezone: hold.timezone,
    };
  }

  /**
   * Converts a hold into a real Booking row, directly at CONFIRMED (no real
   * payment-authorization gate exists this phase). The hold is consumed
   * (deleted) before the DB transaction runs, so a retried confirm on an
   * already-consumed hold correctly reports HOLD_EXPIRED rather than
   * silently succeeding twice — the Idempotency-Key on this route (see
   * BookingsController) is what makes an intentional retry safe.
   */
  async confirm(userId: string, dto: CreateBookingDto): Promise<BookingDto> {
    const hold = await this.bookingHold.consumeHold(dto.holdId);
    if (hold.petId !== dto.petId || hold.userId !== userId) {
      throw new PetAccessDeniedException({ holdId: dto.holdId });
    }

    const scopePreset = dto.healthAccessSelection ?? HealthAccessScopePreset.HEALTH_BASICS;

    try {
      const bookingId = await this.prisma.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: {
            householdId: hold.householdId,
            petId: hold.petId,
            userId,
            providerOrganizationId: hold.providerOrganizationId,
            providerLocationId: hold.providerLocationId,
            providerUserId: hold.providerUserId,
            providerServiceId: hold.providerServiceId,
            startAt: new Date(hold.slotStart),
            endAt: new Date(hold.slotEnd),
            timezone: hold.timezone,
            reasonForVisit: dto.reasonForVisit,
            ownerNotes: dto.ownerNotes,
          },
        });

        await this.events.publish(
          "BookingCreated",
          { bookingId: created.id, petId: created.petId },
          { tx, aggregateType: "Booking", aggregateId: created.id },
        );
        await this.events.publish(
          "BookingConfirmed",
          { bookingId: created.id },
          { tx, aggregateType: "Booking", aggregateId: created.id },
        );

        await this.healthAccess.grantForBooking(created, hold.providerUserId ?? undefined, scopePreset, tx);
        await this.careCalendar.upsertForBooking(created, tx);

        return created.id;
      });

      return this.toDto(await this.loadWithRelations(bookingId));
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new BookingConflictException({ holdId: dto.holdId });
      throw error;
    }
  }

  async list(userId: string, filter: { upcoming?: boolean; past?: boolean; petId?: string }): Promise<BookingDto[]> {
    const memberships = await this.prisma.householdMember.findMany({ where: { userId } });
    const householdIds = memberships.map((m) => m.householdId);
    const now = new Date();

    const bookings = await this.prisma.booking.findMany({
      where: {
        householdId: { in: householdIds },
        ...(filter.petId ? { petId: filter.petId } : {}),
        ...(filter.upcoming ? { startAt: { gte: now } } : {}),
        ...(filter.past ? { startAt: { lt: now } } : {}),
      },
      include: BOOKING_INCLUDE,
      orderBy: { startAt: filter.past ? "desc" : "asc" },
    });

    return bookings.map((b) => this.toDto(b));
  }

  async getById(userId: string, id: string): Promise<BookingDto> {
    const booking = await this.loadWithRelations(id);

    const hasAccess = booking.userId === userId || (await this.petAccess.hasActiveAccess(booking.petId, userId));
    if (!hasAccess) throw new PetAccessDeniedException({ bookingId: id });

    return this.toDto(booking);
  }

  async cancel(userId: string, id: string, dto: CancelBookingDto): Promise<BookingDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundApiException("Booking");

    const effective = await this.petAccess.getEffectivePermissions(booking.petId, userId);
    const canCancel = booking.userId === userId || Boolean(effective?.canBookCare);
    if (!canCancel) throw new PetAccessDeniedException({ bookingId: id });

    if (!CANCELLABLE_STATUSES.includes(booking.bookingStatus)) {
      throw new BookingNotCancellableException({ bookingId: id, status: booking.bookingStatus });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: { bookingStatus: BookingStatus.CANCELLED_BY_USER, cancelledAt: new Date(), cancelledReason: dto.reason },
      });
      await this.healthAccess.revokeForBooking(id, userId, tx);
      await this.careCalendar.markCancelled(id, tx);
      await this.events.publish("BookingCancelled", { bookingId: id, reason: dto.reason }, { tx, aggregateType: "Booking", aggregateId: id });
    });

    return this.toDto(await this.loadWithRelations(id));
  }

  private async loadWithRelations(id: string): Promise<BookingWithRelations> {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    if (!booking) throw new NotFoundApiException("Booking");
    return booking;
  }

  private toDto(booking: BookingWithRelations): BookingDto {
    return {
      id: booking.id,
      householdId: booking.householdId,
      petId: booking.petId,
      userId: booking.userId,
      providerOrganizationId: booking.providerOrganizationId,
      providerLocationId: booking.providerLocationId,
      providerUserId: booking.providerUserId,
      providerServiceId: booking.providerServiceId,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      timezone: booking.timezone,
      bookingStatus: booking.bookingStatus as unknown as BookingDto["bookingStatus"],
      paymentStatus: booking.paymentStatus as unknown as BookingDto["paymentStatus"],
      reasonForVisit: booking.reasonForVisit,
      ownerNotes: booking.ownerNotes,
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      cancelledReason: booking.cancelledReason,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      provider: toProviderSummaryDto(booking.providerOrganization),
      location: toLocationDto(booking.providerLocation),
      service: toServiceDto(booking.providerService),
      healthAccess: booking.healthAccess
        ? {
            scopePreset: booking.healthAccess.scopePreset as unknown as HealthAccessScopePreset,
            expiresAt: booking.healthAccess.petAccessGrant.expiresAt?.toISOString() ?? "",
          }
        : null,
    };
  }
}
