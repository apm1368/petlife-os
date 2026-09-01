import { Injectable } from "@nestjs/common";
import { BookingSeriesFrequency as PrismaBookingSeriesFrequency, BookingStatus, LocationMode as PrismaLocationMode, Prisma, SetupStatus } from "@prisma/client";
import {
  ServiceCategory,
  type BookingDto,
  type BookingHoldDto,
  type BookingPetAccessSummaryDto,
  type BookingSeriesDto,
  type CustomerAddressDto,
  type PetAccessScopePreset,
  type ProviderSummaryDto,
} from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import {
  AddressRequiredException,
  BookingConflictException,
  BookingNotCancellableException,
  NotFoundApiException,
  PetAccessDeniedException,
  PetContextIncompleteException,
  PetNotSupportedException,
  ProviderNotVerifiedException,
  ServiceNotAvailableException,
  SlotUnavailableException,
  ValidationApiException,
} from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import { SlotGeneratorService } from "../providers/slot-generator.service";
import { toProviderLocationDto, toProviderServiceDto } from "../providers/provider-dto.mapper";
import { CareCalendarService } from "../care-calendar/care-calendar.service";
import { BookingHoldService } from "./booking-hold.service";
import { BookingPetAccessService, DEFAULT_SCOPE_PRESET_BY_CATEGORY } from "./booking-pet-access.service";
import type { CreateBookingHoldDto } from "./dto/create-booking-hold.dto";
import type { CreateBookingDto } from "./dto/create-booking.dto";
import type { CancelBookingDto } from "./dto/cancel-booking.dto";

const CANCELLABLE_STATUSES: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED];
const CANCELLED_STATUSES: BookingStatus[] = [BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_PROVIDER];

/** SITTING/BOARDING are booked as a check-in/check-out date range rather than a fixed-duration slot picked from availability rules — see README "Multi-day bookings". */
const DATE_RANGE_CATEGORIES: ServiceCategory[] = [ServiceCategory.SITTING, ServiceCategory.BOARDING];

/** Categories a weekly BookingSeries may be created for (spec section 25). */
const RECURRING_CATEGORIES: ServiceCategory[] = [ServiceCategory.WALKING, ServiceCategory.TRAINING, ServiceCategory.GROOMING];

const BOOKING_INCLUDE = {
  providerOrganization: true,
  providerLocation: true,
  providerService: true,
  customerAddress: true,
  dropoffAddress: true,
  petAccess: { include: { petAccessGrant: true } },
} satisfies Prisma.BookingInclude;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

/** P2002 = unique constraint (the exact-startAt partial indexes); P2004 = any other DB constraint failure, which covers the SITTING/BOARDING overlap EXCLUDE constraint. */
function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2004");
}

function toAddressDto(address: BookingWithRelations["customerAddress"]): CustomerAddressDto | null {
  if (!address) return null;
  return {
    id: address.id,
    householdId: address.householdId,
    label: address.label,
    recipient: address.recipient,
    phone: address.phone,
    addressLine: address.addressLine,
    city: address.city,
    region: address.region,
    countryCode: address.countryCode,
    latitude: address.latitude,
    longitude: address.longitude,
    instructions: address.instructions,
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
    private readonly petAccessGrants: BookingPetAccessService,
    private readonly careCalendar: CareCalendarService,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Re-derives every fact about the requested slot/range from the database
   * rather than trusting the client — the pet's species, the service's
   * active status and species support, the provider's verification, and
   * (via SlotGeneratorService, fixed-slot categories only) that the slot is
   * actually still AVAILABLE right now. PetAccessGuard has already checked
   * canBookCare by the time this runs (see BookingsController).
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

    const isDateRange = DATE_RANGE_CATEGORIES.includes(service.category as unknown as ServiceCategory);

    let rangeStart: Date;
    let rangeEnd: Date;
    let timezone: string;
    let resolvedProviderUserId = dto.providerUserId ?? null;

    if (isDateRange) {
      if (!dto.rangeStart || !dto.rangeEnd) {
        throw new ValidationApiException({ field: "rangeStart/rangeEnd", reason: `${service.category} bookings require a check-in and check-out date` });
      }
      rangeStart = new Date(dto.rangeStart);
      rangeEnd = new Date(dto.rangeEnd);
      if (rangeEnd <= rangeStart) throw new ValidationApiException({ field: "rangeEnd", reason: "rangeEnd must be after rangeStart" });
      timezone = location.timezone;

      const overlapping = await this.prisma.booking.findFirst({
        where: {
          providerLocationId: dto.locationId,
          bookingStatus: { notIn: CANCELLED_STATUSES },
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
        },
      });
      if (overlapping) throw new SlotUnavailableException({ rangeStart: dto.rangeStart, rangeEnd: dto.rangeEnd });
    } else {
      if (!dto.slotStart) throw new ValidationApiException({ field: "slotStart", reason: `${service.category} bookings require a slotStart` });
      rangeStart = new Date(dto.slotStart);
      rangeEnd = new Date(rangeStart.getTime() + service.durationMinutes * 60_000);

      const slots = await this.slotGenerator.generate({
        providerOrganizationId: dto.providerId,
        locationId: dto.locationId,
        serviceId: dto.serviceId,
        providerUserId: dto.providerUserId,
        from: new Date(rangeStart.getTime() - 60_000),
        to: new Date(rangeEnd.getTime() + 60_000),
      });
      const match = slots.find((s) => s.startAt.getTime() === rangeStart.getTime() && s.state === "AVAILABLE");
      if (!match) throw new SlotUnavailableException({ slotStart: dto.slotStart });
      timezone = match.timezone;
      resolvedProviderUserId = dto.providerUserId ?? match.providerUserId ?? null;
    }

    const hold = await this.bookingHold.createHold({
      petId: pet.id,
      householdId: pet.householdId,
      userId,
      providerOrganizationId: dto.providerId,
      providerLocationId: dto.locationId,
      providerUserId: resolvedProviderUserId,
      providerServiceId: dto.serviceId,
      slotStart: rangeStart.toISOString(),
      slotEnd: rangeEnd.toISOString(),
      timezone,
    });

    await this.events.publish("ServiceBookingStarted", { holdId: hold.holdId, petId: pet.id, providerId: dto.providerId, category: service.category });

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

    const service = await this.prisma.providerService.findUnique({ where: { id: hold.providerServiceId } });
    if (!service) throw new NotFoundApiException("Service");
    // service.category/locationMode are already Prisma's own enum types — used as-is for the
    // Booking write below; cast to @petlife/types only for app-logic lookups/comparisons.
    const category = service.category as unknown as ServiceCategory;
    const locationMode = service.locationMode;

    const scopePreset = dto.accessSelection ?? DEFAULT_SCOPE_PRESET_BY_CATEGORY[category];

    const { customerAddressId, dropoffAddressId } = await this.resolveAddresses(hold.householdId, locationMode, dto);

    await this.assertPetContextComplete(hold.petId, service);

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
            category: service.category,
            locationMode: service.locationMode,
            customerAddressId,
            dropoffAddressId,
            startAt: new Date(hold.slotStart),
            endAt: new Date(hold.slotEnd),
            timezone: hold.timezone,
            reasonForVisit: dto.reasonForVisit,
            ownerNotes: dto.ownerNotes,
          },
        });

        await this.events.publish(
          "ServiceBookingConfirmed",
          { bookingId: created.id, petId: created.petId, category },
          { tx, aggregateType: "Booking", aggregateId: created.id },
        );

        await this.petAccessGrants.grantForBooking(created, hold.providerUserId ?? undefined, scopePreset, tx);
        await this.careCalendar.upsertForBooking(created, tx);

        return created.id;
      });

      return this.toDto(await this.loadWithRelations(bookingId));
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new BookingConflictException({ holdId: dto.holdId });
      throw error;
    }
  }

  async list(userId: string, filter: { upcoming?: boolean; past?: boolean; cancelled?: boolean; petId?: string }): Promise<BookingDto[]> {
    const memberships = await this.prisma.householdMember.findMany({ where: { userId } });
    const householdIds = memberships.map((m) => m.householdId);
    const now = new Date();

    const bookings = await this.prisma.booking.findMany({
      where: {
        householdId: { in: householdIds },
        ...(filter.petId ? { petId: filter.petId } : {}),
        ...(filter.cancelled
          ? { bookingStatus: { in: CANCELLED_STATUSES } }
          : filter.upcoming
            ? { startAt: { gte: now }, bookingStatus: { notIn: CANCELLED_STATUSES } }
            : filter.past
              ? { startAt: { lt: now } }
              : {}),
      },
      include: BOOKING_INCLUDE,
      orderBy: { startAt: filter.past || filter.cancelled ? "desc" : "asc" },
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
      await this.petAccessGrants.revokeForBooking(id, userId, tx);
      await this.careCalendar.markCancelled(id, tx);
      await this.events.publish(
        "ServiceBookingCancelled",
        { bookingId: id, reason: dto.reason, category: booking.category },
        { tx, aggregateType: "Booking", aggregateId: id },
      );
    });

    return this.toDto(await this.loadWithRelations(id));
  }

  /**
   * Generates a weekly BookingSeries from an already-confirmed booking
   * (spec sections 25-26) — WALKING/TRAINING/GROOMING only. Each future
   * occurrence is validated independently via SlotGeneratorService; a date
   * that is no longer available is simply skipped, never failing the whole
   * series (spec: "a failed/cancelled occurrence must not destroy whole
   * series"). Cancelling one occurrence later (POST /bookings/:id/cancel)
   * never touches this series row or any sibling occurrence — there is no
   * series-wide cancel endpoint this phase; see README Known limitations.
   */
  async createWeeklySeries(userId: string, originBookingId: string, occurrences: number): Promise<{ series: BookingSeriesDto; createdBookingIds: string[]; skippedStarts: string[] }> {
    const origin = await this.prisma.booking.findUnique({ where: { id: originBookingId }, include: { petAccess: true } });
    if (!origin) throw new NotFoundApiException("Booking");

    const hasAccess = origin.userId === userId || (await this.petAccess.hasActiveAccess(origin.petId, userId));
    if (!hasAccess) throw new PetAccessDeniedException({ bookingId: originBookingId });

    const category = origin.category as unknown as ServiceCategory;
    if (!RECURRING_CATEGORIES.includes(category)) {
      throw new ValidationApiException({ field: "category", reason: `Recurring bookings are only supported for ${RECURRING_CATEGORIES.join(", ")}` });
    }
    if (origin.bookingStatus !== BookingStatus.CONFIRMED) {
      throw new ValidationApiException({ field: "bookingStatus", reason: "Only a confirmed booking can start a series" });
    }
    if (occurrences < 2 || occurrences > 8) {
      throw new ValidationApiException({ field: "occurrences", reason: "occurrences must be between 2 and 8" });
    }

    const scopePreset = (origin.petAccess?.scopePreset as unknown as PetAccessScopePreset | undefined) ?? DEFAULT_SCOPE_PRESET_BY_CATEGORY[category];
    const durationMs = origin.endAt.getTime() - origin.startAt.getTime();

    const series = await this.prisma.bookingSeries.create({
      data: {
        householdId: origin.householdId,
        petId: origin.petId,
        userId: origin.userId,
        providerOrganizationId: origin.providerOrganizationId,
        providerServiceId: origin.providerServiceId,
        frequency: PrismaBookingSeriesFrequency.WEEKLY,
      },
    });
    await this.prisma.booking.update({ where: { id: origin.id }, data: { bookingSeriesId: series.id } });

    const createdBookingIds: string[] = [origin.id];
    const skippedStarts: string[] = [];

    for (let i = 1; i < occurrences; i += 1) {
      const startAt = new Date(origin.startAt.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + durationMs);

      const slots = await this.slotGenerator.generate({
        providerOrganizationId: origin.providerOrganizationId,
        locationId: origin.providerLocationId,
        serviceId: origin.providerServiceId,
        providerUserId: origin.providerUserId ?? undefined,
        from: new Date(startAt.getTime() - 60_000),
        to: new Date(endAt.getTime() + 60_000),
      });
      const available = slots.some((s) => s.startAt.getTime() === startAt.getTime() && s.state === "AVAILABLE");
      if (!available) {
        skippedStarts.push(startAt.toISOString());
        continue;
      }

      try {
        const occurrenceId = await this.prisma.$transaction(async (tx) => {
          const created = await tx.booking.create({
            data: {
              householdId: origin.householdId,
              petId: origin.petId,
              userId: origin.userId,
              providerOrganizationId: origin.providerOrganizationId,
              providerLocationId: origin.providerLocationId,
              providerUserId: origin.providerUserId,
              providerServiceId: origin.providerServiceId,
              category: origin.category,
              locationMode: origin.locationMode,
              customerAddressId: origin.customerAddressId,
              dropoffAddressId: origin.dropoffAddressId,
              bookingSeriesId: series.id,
              startAt,
              endAt,
              timezone: origin.timezone,
              reasonForVisit: origin.reasonForVisit,
              ownerNotes: origin.ownerNotes,
            },
          });
          await this.events.publish(
            "ServiceBookingConfirmed",
            { bookingId: created.id, petId: created.petId, category, bookingSeriesId: series.id },
            { tx, aggregateType: "Booking", aggregateId: created.id },
          );
          await this.petAccessGrants.grantForBooking(created, origin.providerUserId ?? undefined, scopePreset, tx);
          await this.careCalendar.upsertForBooking(created, tx);
          return created.id;
        });
        createdBookingIds.push(occurrenceId);
      } catch {
        skippedStarts.push(startAt.toISOString());
      }
    }

    await this.events.publish("BookingSeriesCreated", { seriesId: series.id, petId: origin.petId, createdBookingIds, skippedStarts });

    return {
      series: {
        id: series.id,
        householdId: series.householdId,
        petId: series.petId,
        userId: series.userId,
        providerOrganizationId: series.providerOrganizationId,
        providerServiceId: series.providerServiceId,
        frequency: series.frequency as unknown as BookingSeriesDto["frequency"],
        status: series.status as unknown as BookingSeriesDto["status"],
      },
      createdBookingIds,
      skippedStarts,
    };
  }

  private async resolveAddresses(
    householdId: string,
    locationMode: PrismaLocationMode,
    dto: CreateBookingDto,
  ): Promise<{ customerAddressId: string | null; dropoffAddressId: string | null }> {
    if (locationMode === PrismaLocationMode.AT_PROVIDER) {
      return { customerAddressId: null, dropoffAddressId: null };
    }

    if (!dto.customerAddressId) throw new AddressRequiredException({ locationMode });
    const primary = await this.prisma.customerAddress.findUnique({ where: { id: dto.customerAddressId } });
    if (!primary || primary.householdId !== householdId) throw new AddressRequiredException({ locationMode });

    if (locationMode === PrismaLocationMode.TRANSPORT) {
      if (!dto.dropoffAddressId) throw new AddressRequiredException({ locationMode, field: "dropoffAddressId" });
      const dropoff = await this.prisma.customerAddress.findUnique({ where: { id: dto.dropoffAddressId } });
      if (!dropoff || dropoff.householdId !== householdId) throw new AddressRequiredException({ locationMode, field: "dropoffAddressId" });
      return { customerAddressId: dto.customerAddressId, dropoffAddressId: dto.dropoffAddressId };
    }

    return { customerAddressId: dto.customerAddressId, dropoffAddressId: null };
  }

  /** Only a completely NOT_STARTED required profile blocks confirmation — see PetContextIncompleteException's doc comment. */
  private async assertPetContextComplete(petId: string, service: { requiresCareProfile: boolean; requiresHealthBasics: boolean }): Promise<void> {
    if (service.requiresCareProfile) {
      const careProfile = await this.prisma.careProfile.findUnique({ where: { petId } });
      if ((careProfile?.status ?? SetupStatus.NOT_STARTED) === SetupStatus.NOT_STARTED) {
        throw new PetContextIncompleteException({ petId, field: "careProfile" });
      }
    }
    if (service.requiresHealthBasics) {
      const healthProfile = await this.prisma.healthProfile.findUnique({ where: { petId } });
      if ((healthProfile?.status ?? SetupStatus.NOT_STARTED) === SetupStatus.NOT_STARTED) {
        throw new PetContextIncompleteException({ petId, field: "healthProfile" });
      }
    }
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
      category: booking.category as unknown as BookingDto["category"],
      locationMode: booking.locationMode as unknown as BookingDto["locationMode"],
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
      location: toProviderLocationDto(booking.providerLocation),
      service: toProviderServiceDto(booking.providerService),
      customerAddress: toAddressDto(booking.customerAddress),
      dropoffAddress: toAddressDto(booking.dropoffAddress),
      bookingSeriesId: booking.bookingSeriesId,
      petAccess: booking.petAccess ? this.toPetAccessSummary(booking.petAccess) : null,
    };
  }

  private toPetAccessSummary(petAccess: NonNullable<BookingWithRelations["petAccess"]>): BookingPetAccessSummaryDto {
    return {
      scopePreset: petAccess.scopePreset as unknown as BookingPetAccessSummaryDto["scopePreset"],
      expiresAt: petAccess.petAccessGrant.expiresAt?.toISOString() ?? "",
    };
  }
}
