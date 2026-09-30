import { Injectable } from "@nestjs/common";
import { BookingActorType, BookingMode, BookingPaymentMode, BookingSeriesFrequency as PrismaBookingSeriesFrequency, BookingStatus, CartStatus, CheckoutStatus, LocationMode as PrismaLocationMode, PaymentMethodType, PaymentProvider, PaymentStatus, Prisma, SetupStatus } from "@prisma/client";
import {
  ServiceCategory,
  type BookingDto,
  type BookingHoldDto,
  type BookingPetAccessSummaryDto,
  type BookingSeriesDto,
  PetCompatibilityStatus,
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
  InvalidBookingTransitionException,
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
import { BookingLifecycleService, OCCUPYING_STATUSES, TERMINAL_RELEASE_STATUSES, bookingEventFields } from "./booking-lifecycle.service";
import { PetServiceCompatibilityService } from "../services/pet-service-compatibility.service";
import { PaymentsService } from "../commerce/payments/payments.service";
import { LedgerService } from "../commerce/ledger/ledger.service";
import type { PaymentChargeMode } from "../commerce/payments/payment-gateway.interface";
import type { RescheduleBookingDto } from "./dto/reschedule-booking.dto";
import type { PayBookingDto } from "./dto/pay-booking.dto";
import type { CreateBookingHoldDto } from "./dto/create-booking-hold.dto";
import type { CreateBookingDto } from "./dto/create-booking.dto";
import type { CancelBookingDto } from "./dto/cancel-booking.dto";

const CANCELLABLE_STATUSES: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.REQUESTED, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED];
/** Payment window after an instant booking or an accepted request, before the booking expires unpaid. */
const PAYMENT_WINDOW_MINUTES = 30;

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
  variant: true,
  additionalPets: true,
  statusEvents: { orderBy: { createdAt: "asc" } },
  review: { select: { id: true, rating: true } },
  rescheduledTo: { select: { id: true } },
} satisfies Prisma.BookingInclude;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

/** P2002 = unique constraint (the exact-startAt partial indexes); P2004 = any other DB constraint failure, which covers the SITTING/BOARDING overlap EXCLUDE constraint. */
/** Postgres 23P01 (exclusion_violation) from the no-overlap constraints surfaces as an unknown/raw request error. */
function isExclusionViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.includes("23P01") || message.includes("exclusion constraint") || message.includes("bookings_no_overlap");
}

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
    private readonly lifecycle: BookingLifecycleService,
    private readonly compatibility: PetServiceCompatibilityService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
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

    const service = await this.prisma.providerService.findUnique({ where: { id: dto.serviceId }, include: { variants: true } });
    if (!service || service.providerOrganizationId !== dto.providerId) throw new NotFoundApiException("Service");
    if (!service.isActive) throw new ServiceNotAvailableException({ serviceId: dto.serviceId });

    const variant = dto.variantId ? service.variants.find((v) => v.id === dto.variantId && v.isActive) : undefined;
    if (dto.variantId && !variant) throw new NotFoundApiException("Service variant");
    if (!dto.variantId && service.variants.some((v) => v.isActive)) {
      throw new ValidationApiException({ field: "variantId", reason: "Choose one of this service's options" });
    }

    // Multi-pet: every pet must belong to the same household, be bookable by this user and fit the provider's own rules.
    const additionalPetIds = [...new Set(dto.additionalPetIds ?? [])].filter((id) => id !== pet.id);
    if (1 + additionalPetIds.length > service.maxPetsPerBooking) {
      throw new ValidationApiException({ field: "additionalPetIds", reason: `This service accepts at most ${service.maxPetsPerBooking} pet(s) per booking` });
    }
    const pets = [pet];
    for (const extraId of additionalPetIds) {
      const extra = await this.prisma.pet.findUnique({ where: { id: extraId } });
      if (!extra || extra.householdId !== pet.householdId) throw new NotFoundApiException("Pet");
      const access = await this.petAccess.getEffectivePermissions(extraId, userId);
      if (!access?.canBookCare) throw new PetAccessDeniedException({ petId: extraId });
      pets.push(extra);
    }
    for (const candidate of pets) {
      const fit = await this.compatibility.evaluate(candidate, service);
      if (fit.status === PetCompatibilityStatus.NOT_SUPPORTED) throw new PetNotSupportedException({ petId: candidate.id, serviceId: dto.serviceId, reasons: fit.reasons });
    }

    const location = await this.prisma.providerLocation.findUnique({ where: { id: dto.locationId } });
    if (!location || location.providerOrganizationId !== dto.providerId) throw new NotFoundApiException("Location");

    const isDateRange = DATE_RANGE_CATEGORIES.includes(service.category as unknown as ServiceCategory);
    const durationMinutes = variant?.durationMinutes ?? service.durationMinutes;

    let rangeStart: Date;
    let rangeEnd: Date;
    let timezone: string;
    let resolvedProviderUserId = dto.providerUserId ?? null;
    let resourceId: string | null = null;

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
          bookingStatus: { in: OCCUPYING_STATUSES },
          startAt: { lt: rangeEnd },
          endAt: { gt: rangeStart },
        },
      });
      if (overlapping) throw new SlotUnavailableException({ rangeStart: dto.rangeStart, rangeEnd: dto.rangeEnd });
    } else {
      if (!dto.slotStart) throw new ValidationApiException({ field: "slotStart", reason: `${service.category} bookings require a slotStart` });
      rangeStart = new Date(dto.slotStart);
      rangeEnd = new Date(rangeStart.getTime() + durationMinutes * 60_000);

      const slots = await this.slotGenerator.generate({
        providerOrganizationId: dto.providerId,
        locationId: dto.locationId,
        serviceId: dto.serviceId,
        providerUserId: dto.providerUserId,
        variantId: variant?.id,
        from: new Date(rangeStart.getTime() - 60_000),
        to: new Date(rangeEnd.getTime() + 60_000),
      });
      // "Any professional": slots are ordered by time then staff id, so the first available qualified
      // staff member at that time is assigned — deterministic and documented in the booking pattern.
      const match = slots.find((s) => s.startAt.getTime() === rangeStart.getTime() && s.state === "AVAILABLE");
      if (!match) throw new SlotUnavailableException({ slotStart: dto.slotStart });
      timezone = match.timezone;
      resolvedProviderUserId = dto.providerUserId ?? match.providerUserId ?? null;
      resourceId = match.resourceId ?? null;
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
      variantId: variant?.id ?? null,
      additionalPetIds,
      resourceId,
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
      variantId: hold.variantId,
      additionalPetIds: hold.additionalPetIds,
    };
  }

  /**
   * Converts a hold into a real Booking with frozen price/policy snapshots. The resulting state is
   * decided by the service's own policy: REQUEST mode → REQUESTED (provider must accept before the
   * expiry), online prepayment/deposit → AWAITING_PAYMENT, otherwise CONFIRMED. The hold is consumed
   * before the transaction, so a retried confirm on a consumed hold reports HOLD_EXPIRED; the
   * Idempotency-Key on this route makes an intentional retry safe. Postgres exclusion constraints
   * are the last line against double booking.
   */
  async confirm(userId: string, dto: CreateBookingDto): Promise<BookingDto> {
    const hold = await this.bookingHold.consumeHold(dto.holdId);
    if (hold.petId !== dto.petId || hold.userId !== userId) {
      throw new PetAccessDeniedException({ holdId: dto.holdId });
    }

    const service = await this.prisma.providerService.findUnique({ where: { id: hold.providerServiceId }, include: { variants: true } });
    if (!service) throw new NotFoundApiException("Service");
    const variant = hold.variantId ? service.variants.find((v) => v.id === hold.variantId) ?? null : null;
    if (hold.variantId && (!variant || !variant.isActive)) throw new ServiceNotAvailableException({ serviceId: service.id, variantId: hold.variantId });
    // service.category/locationMode are already Prisma's own enum types — used as-is for the
    // Booking write below; cast to @petlife/types only for app-logic lookups/comparisons.
    const category = service.category as unknown as ServiceCategory;
    const locationMode = service.locationMode;

    const scopePreset = dto.accessSelection ?? DEFAULT_SCOPE_PRESET_BY_CATEGORY[category];

    const { customerAddressId, dropoffAddressId } = await this.resolveAddresses(hold.householdId, locationMode, dto);

    await this.assertPetContextComplete(hold.petId, service);

    const unitPrice = variant?.priceAmount ?? service.priceAmount;
    const petCount = 1 + (hold.additionalPetIds?.length ?? 0);
    const priceAmount = unitPrice === null ? null : new Prisma.Decimal(unitPrice).mul(petCount);
    const onlinePayment = service.paymentMode === BookingPaymentMode.FULL_PREPAYMENT || service.paymentMode === BookingPaymentMode.DEPOSIT;
    if (onlinePayment && (priceAmount === null || (service.paymentMode === BookingPaymentMode.DEPOSIT && !service.depositAmount))) {
      // A misconfigured paid service must never produce an unpriced "paid" booking.
      throw new ServiceNotAvailableException({ serviceId: service.id, reason: "PAYMENT_POLICY_INCOMPLETE" });
    }
    const now = new Date();
    const initialStatus =
      service.bookingMode === BookingMode.REQUEST ? BookingStatus.REQUESTED : onlinePayment ? BookingStatus.AWAITING_PAYMENT : BookingStatus.CONFIRMED;
    const requestExpiresAt =
      initialStatus === BookingStatus.REQUESTED
        ? new Date(Math.min(now.getTime() + service.requestTtlHours * 3600_000, new Date(hold.slotStart).getTime()))
        : initialStatus === BookingStatus.AWAITING_PAYMENT
          ? new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60_000)
          : null;

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
            bookingStatus: initialStatus,
            paymentStatus: onlinePayment ? PaymentStatus.PENDING : PaymentStatus.NOT_REQUIRED,
            bookingNumber: await this.lifecycle.nextBookingNumber(tx),
            variantId: variant?.id ?? null,
            resourceId: hold.resourceId ?? null,
            bookingMode: service.bookingMode,
            paymentMode: service.paymentMode,
            priceAmount,
            discountAmount: 0,
            depositAmount: service.paymentMode === BookingPaymentMode.DEPOSIT ? service.depositAmount : null,
            currency: service.currency,
            durationMinutes: variant?.durationMinutes ?? service.durationMinutes,
            serviceNameSnapshot: service.name,
            variantNameSnapshot: variant?.name ?? null,
            cancellationPolicySnapshot: service.cancellationPolicy,
            freeCancellationHours: service.freeCancellationHours,
            lateCancellationRefundPercent: service.lateCancellationRefundPercent,
            preparationSnapshot: service.preparationNotes,
            requestExpiresAt,
            additionalPets: { create: (hold.additionalPetIds ?? []).map((petId) => ({ petId })) },
          },
        });
        await this.lifecycle.recordCreated(tx, created, BookingActorType.USER, userId);

        const eventType =
          initialStatus === BookingStatus.REQUESTED ? "ServiceBookingRequested" : initialStatus === BookingStatus.AWAITING_PAYMENT ? "ServiceBookingAwaitingPayment" : "ServiceBookingConfirmed";
        await this.events.publish(eventType, bookingEventFields(created), { tx, aggregateType: "Booking", aggregateId: created.id });

        await this.petAccessGrants.grantForBooking(created, hold.providerUserId ?? undefined, scopePreset, tx, dto.accessSelection !== undefined);
        if (initialStatus !== BookingStatus.REQUESTED) await this.careCalendar.upsertForBooking(created, tx);

        return created.id;
      });

      return this.toDto(await this.loadWithRelations(bookingId));
    } catch (error) {
      if (isUniqueConstraintViolation(error) || isExclusionViolation(error)) throw new BookingConflictException({ holdId: dto.holdId });
      throw error;
    }
  }

  async list(
    userId: string,
    filter: { upcoming?: boolean; past?: boolean; cancelled?: boolean; requested?: boolean; petId?: string; serviceId?: string; providerId?: string; from?: string; to?: string },
  ): Promise<BookingDto[]> {
    const memberships = await this.prisma.householdMember.findMany({ where: { userId } });
    const householdIds = memberships.map((m) => m.householdId);
    const now = new Date();
    const closed: BookingStatus[] = [...TERMINAL_RELEASE_STATUSES];
    const pending: BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.AWAITING_PAYMENT];

    const bookings = await this.prisma.booking.findMany({
      where: {
        householdId: { in: householdIds },
        ...(filter.petId ? { OR: [{ petId: filter.petId }, { additionalPets: { some: { petId: filter.petId } } }] } : {}),
        ...(filter.serviceId ? { providerServiceId: filter.serviceId } : {}),
        ...(filter.providerId ? { providerOrganizationId: filter.providerId } : {}),
        ...(filter.from || filter.to ? { startAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lt: new Date(filter.to) } : {}) } } : {}),
        ...(filter.cancelled
          ? { bookingStatus: { in: closed } }
          : filter.requested
            ? { bookingStatus: { in: pending } }
            : filter.upcoming
              ? { endAt: { gte: now }, bookingStatus: { notIn: [...closed, ...pending, BookingStatus.COMPLETED, BookingStatus.NO_SHOW] } }
              : filter.past
                ? { OR: [{ bookingStatus: { in: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW] } }, { endAt: { lt: now }, bookingStatus: { notIn: closed } }] }
                : {}),
      },
      include: BOOKING_INCLUDE,
      orderBy: { startAt: filter.past || filter.cancelled ? "desc" : "asc" },
      take: 200,
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
      const cancelled = await this.lifecycle.transition(tx, {
        bookingId: id,
        to: BookingStatus.CANCELLED_BY_USER,
        actorType: BookingActorType.USER,
        actorId: userId,
        reason: dto.reason ?? null,
        data: { cancelledAt: new Date(), cancelledReason: dto.reason },
      });
      await this.lifecycle.requestRefund(tx, cancelled, false, userId);
      await this.events.publish(
        "ServiceBookingCancelled",
        { ...bookingEventFields(cancelled), reason: dto.reason },
        { tx, aggregateType: "Booking", aggregateId: id },
      );
    });

    return this.toDto(await this.loadWithRelations(id));
  }

  /**
   * Pays an AWAITING_PAYMENT booking (full prepayment or deposit) through the existing H07 stack:
   * a minimal internal Checkout shell → PaymentIntent → gateway charge. Only a SUCCEEDED charge
   * confirms the booking; FAILED keeps it awaiting payment (retryable until its window expires),
   * PENDING leaves it for the provider webhook. The gateway is whatever PAYMENT_SANDBOX_MODE
   * configures — this code never reports success the gateway did not report.
   */
  async pay(userId: string, id: string, dto: PayBookingDto): Promise<BookingDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundApiException("Booking");
    if (booking.userId !== userId) throw new PetAccessDeniedException({ bookingId: id });
    if (booking.bookingStatus !== BookingStatus.AWAITING_PAYMENT) {
      throw new InvalidBookingTransitionException({ bookingId: id, from: booking.bookingStatus, to: BookingStatus.CONFIRMED });
    }
    if (booking.requestExpiresAt && booking.requestExpiresAt <= new Date()) {
      throw new InvalidBookingTransitionException({ bookingId: id, reason: "PAYMENT_WINDOW_EXPIRED" });
    }
    const amount = Math.round(Number(booking.paymentMode === BookingPaymentMode.DEPOSIT ? booking.depositAmount : booking.priceAmount) - (booking.paymentMode === BookingPaymentMode.DEPOSIT ? 0 : Number(booking.discountAmount)));
    if (!Number.isFinite(amount) || amount <= 0) throw new ServiceNotAvailableException({ bookingId: id, reason: "PAYMENT_AMOUNT_INVALID" });
    const currency = booking.currency ?? "IRR";

    const intentId = await this.prisma.$transaction(async (tx) => {
      // One intent per booking even when pay is tapped twice: the row lock serialises this block and the
      // intent id is re-read inside it, so the second request reuses the first one's intent (and then
      // loses the claim in PaymentsService.charge) instead of creating and charging its own.
      await tx.$queryRaw`SELECT id FROM "bookings" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.booking.findUniqueOrThrow({ where: { id }, select: { paymentIntentId: true, bookingStatus: true } });
      if (current.bookingStatus !== BookingStatus.AWAITING_PAYMENT) throw new InvalidBookingTransitionException({ bookingId: id, from: current.bookingStatus, to: BookingStatus.CONFIRMED });
      if (current.paymentIntentId) {
        const existing = await tx.paymentIntent.findUniqueOrThrow({ where: { id: current.paymentIntentId } });
        if (existing.status !== "FAILED" && existing.status !== "CANCELLED") return existing.id;
      }
      const cart = await tx.cart.create({ data: { userId, status: CartStatus.CONVERTED } });
      const checkout = await tx.checkout.create({
        data: { userId, householdId: booking.householdId, cartId: cart.id, paymentMethodType: PaymentMethodType.ONLINE_PAYMENT, status: CheckoutStatus.READY_FOR_PAYMENT, subtotalAmount: amount, totalAmount: amount, currency },
      });
      const intent = await this.payments.createIntent(checkout.id, amount, currency, dto.provider ?? PaymentProvider.DEV_SIMULATED, `booking:${id}:${Date.now()}`, tx);
      await tx.booking.update({ where: { id }, data: { paymentIntentId: intent.id } });
      return intent.id;
    });

    const outcome = await this.payments.charge(intentId, dto.mode as PaymentChargeMode | undefined);
    if (outcome.status === "SUCCEEDED") {
      await this.prisma.$transaction(async (tx) => {
        // The money is in: it goes in the ledger whatever happens to the booking next.
        const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
        await this.ledger.recordPaymentSucceeded(intent.checkoutId, intent.amount, intent.currency, tx);
        const current = await tx.booking.findUniqueOrThrow({ where: { id } });
        if (current.bookingStatus !== BookingStatus.AWAITING_PAYMENT) {
          // Paid after the booking expired or was cancelled in between: never confirm silently —
          // record the payment and hand a full refund to the finance workflow.
          const late = await tx.booking.update({ where: { id }, data: { paymentStatus: PaymentStatus.PAID, paymentIntentId: intentId } });
          await this.lifecycle.requestRefund(tx, late, true, userId);
          return;
        }
        const paid = await this.lifecycle.transition(tx, {
          bookingId: id,
          to: BookingStatus.CONFIRMED,
          from: [BookingStatus.AWAITING_PAYMENT],
          actorType: BookingActorType.USER,
          actorId: userId,
          reason: booking.paymentMode === BookingPaymentMode.DEPOSIT ? "DEPOSIT_PAID" : "PAID",
          data: { paymentStatus: PaymentStatus.PAID, requestExpiresAt: null },
        });
        await this.careCalendar.upsertForBooking(paid, tx);
        await this.events.publish("ServiceBookingPaid", { ...bookingEventFields(paid), amount, currency }, { tx, aggregateType: "Booking", aggregateId: id });
        await this.events.publish("ServiceBookingConfirmed", bookingEventFields(paid), { tx, aggregateType: "Booking", aggregateId: id });
      });
    } else if (outcome.status === "FAILED") {
      await this.prisma.booking.update({ where: { id }, data: { paymentStatus: PaymentStatus.FAILED } });
    }
    return this.toDto(await this.loadWithRelations(id));
  }

  /**
   * Safe reschedule: validates the new slot (ignoring this booking's own time), then in ONE
   * transaction marks the old booking RESCHEDULED and inserts its successor with the same frozen
   * price/policy/payment. If the insert loses a race the whole transaction rolls back and the
   * original booking is untouched — the original slot is never released before the new one is held.
   * The provider-access grant moves to the successor with the owner's original consent decision.
   */
  async reschedule(userId: string, id: string, dto: RescheduleBookingDto): Promise<BookingDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include: { additionalPets: true, petAccess: { include: { petAccessGrant: true } } } });
    if (!booking) throw new NotFoundApiException("Booking");
    const effective = await this.petAccess.getEffectivePermissions(booking.petId, userId);
    if (booking.userId !== userId && !effective?.canBookCare) throw new PetAccessDeniedException({ bookingId: id });
    if (booking.bookingStatus !== BookingStatus.CONFIRMED || booking.startAt <= new Date()) {
      throw new InvalidBookingTransitionException({ bookingId: id, from: booking.bookingStatus, to: BookingStatus.RESCHEDULED });
    }
    if (DATE_RANGE_CATEGORIES.includes(booking.category as unknown as ServiceCategory)) {
      throw new ValidationApiException({ field: "slotStart", reason: "Date-range stays are changed by cancelling and booking again" });
    }
    const newStart = new Date(dto.slotStart);
    const duration = booking.endAt.getTime() - booking.startAt.getTime();
    const newEnd = new Date(newStart.getTime() + duration);
    const slots = await this.slotGenerator.generate({
      providerOrganizationId: booking.providerOrganizationId,
      locationId: booking.providerLocationId,
      serviceId: booking.providerServiceId,
      providerUserId: dto.providerUserId ?? undefined,
      variantId: booking.variantId ?? undefined,
      from: new Date(newStart.getTime() - 60_000),
      to: new Date(newEnd.getTime() + 60_000),
      ignoreBookingId: id,
    });
    const match = slots.find((s) => s.startAt.getTime() === newStart.getTime() && s.state === "AVAILABLE");
    if (!match) throw new SlotUnavailableException({ slotStart: dto.slotStart });

    try {
      const successorId = await this.prisma.$transaction(async (tx) => {
        await this.lifecycle.transition(tx, {
          bookingId: id,
          to: BookingStatus.RESCHEDULED,
          from: [BookingStatus.CONFIRMED],
          actorType: BookingActorType.USER,
          actorId: userId,
          reason: `RESCHEDULED_TO:${newStart.toISOString()}`,
        });
        const { id: _oldId, createdAt: _c, updatedAt: _u, bookingNumber: _n, rescheduledFromBookingId: _r, bookingStatus: _s, ...copy } = booking as typeof booking & Record<string, unknown>;
        delete (copy as Record<string, unknown>).additionalPets;
        delete (copy as Record<string, unknown>).petAccess;
        const successor = await tx.booking.create({
          data: {
            ...(copy as Prisma.BookingUncheckedCreateInput),
            startAt: newStart,
            endAt: newEnd,
            timezone: match.timezone,
            providerUserId: dto.providerUserId ?? match.providerUserId ?? booking.providerUserId,
            resourceId: match.resourceId ?? booking.resourceId,
            bookingStatus: BookingStatus.CONFIRMED,
            bookingNumber: await this.lifecycle.nextBookingNumber(tx),
            rescheduledFromBookingId: id,
            additionalPets: { create: booking.additionalPets.map((p) => ({ petId: p.petId })) },
          },
        });
        await tx.bookingStatusEvent.create({ data: { bookingId: successor.id, fromStatus: null, toStatus: BookingStatus.CONFIRMED, actorType: BookingActorType.USER, actorId: userId, reason: `RESCHEDULED_FROM:${booking.bookingNumber ?? id}` } });
        // Access moves with the appointment: end the old grant, issue one for the new window with the same consent.
        await this.petAccessGrants.revokeForBooking(id, userId, tx);
        if (booking.petAccess) {
          const consented = booking.petAccess.petAccessGrant.reason?.endsWith("_HEALTH_CONSENT") ?? false;
          await this.petAccessGrants.grantForBooking(successor, successor.providerUserId ?? undefined, booking.petAccess.scopePreset as unknown as PetAccessScopePreset, tx, consented);
        }
        await this.careCalendar.upsertForBooking(successor, tx);
        await this.events.publish("ServiceBookingRescheduled", { ...bookingEventFields(successor), fromBookingId: id }, { tx, aggregateType: "Booking", aggregateId: successor.id });
        return successor.id;
      });
      return this.toDto(await this.loadWithRelations(successorId));
    } catch (error) {
      if (isUniqueConstraintViolation(error) || isExclusionViolation(error)) throw new BookingConflictException({ slotStart: dto.slotStart });
      throw error;
    }
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
  async createWeeklySeries(userId: string, originBookingId: string, occurrences: number, intervalWeeks = 1): Promise<{ series: BookingSeriesDto; createdBookingIds: string[]; skippedStarts: string[] }> {
    const origin = await this.prisma.booking.findUnique({ where: { id: originBookingId }, include: { petAccess: true } });
    if (!origin) throw new NotFoundApiException("Booking");

    const hasAccess = origin.userId === userId || (await this.petAccess.hasActiveAccess(origin.petId, userId));
    if (!hasAccess) throw new PetAccessDeniedException({ bookingId: originBookingId });

    const category = origin.category as unknown as ServiceCategory;
    const originService = await this.prisma.providerService.findUniqueOrThrow({ where: { id: origin.providerServiceId } });
    const isRehab = originService.type === "REHAB_SESSION";
    if (!RECURRING_CATEGORIES.includes(category) && !isRehab) {
      throw new ValidationApiException({ field: "category", reason: `Recurring bookings are only supported for ${RECURRING_CATEGORIES.join(", ")}` });
    }
    if (origin.bookingStatus !== BookingStatus.CONFIRMED) {
      throw new ValidationApiException({ field: "bookingStatus", reason: "Only a confirmed booking can start a series" });
    }
    if (origin.paymentMode === BookingPaymentMode.FULL_PREPAYMENT || origin.paymentMode === BookingPaymentMode.DEPOSIT) {
      // Each prepaid occurrence needs its own payment; a series must never confirm unpaid appointments.
      throw new ValidationApiException({ field: "paymentMode", reason: "Prepaid services are rebooked one appointment at a time" });
    }
    if (intervalWeeks < 1 || intervalWeeks > 4) {
      throw new ValidationApiException({ field: "intervalWeeks", reason: "intervalWeeks must be between 1 and 4" });
    }
    if (occurrences < 2 || occurrences > 8) {
      throw new ValidationApiException({ field: "occurrences", reason: "occurrences must be between 2 and 8" });
    }

    const scopePreset = (origin.petAccess?.scopePreset as unknown as PetAccessScopePreset | undefined) ?? DEFAULT_SCOPE_PRESET_BY_CATEGORY[category];
    // Occurrences inherit the owner's health-consent decision from the origin booking, never widen it.
    const originGrant = origin.petAccess ? await this.prisma.petAccessGrant.findUnique({ where: { id: origin.petAccess.petAccessGrantId }, select: { reason: true } }) : null;
    const originConsented = originGrant?.reason?.endsWith("_HEALTH_CONSENT") ?? false;
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
      const startAt = new Date(origin.startAt.getTime() + i * intervalWeeks * 7 * 24 * 60 * 60 * 1000);
      const endAt = new Date(startAt.getTime() + durationMs);

      const slots = await this.slotGenerator.generate({
        providerOrganizationId: origin.providerOrganizationId,
        locationId: origin.providerLocationId,
        serviceId: origin.providerServiceId,
        providerUserId: origin.providerUserId ?? undefined,
        variantId: origin.variantId ?? undefined,
        from: new Date(startAt.getTime() - 60_000),
        to: new Date(endAt.getTime() + 60_000),
      });
      const slot = slots.find((s) => s.startAt.getTime() === startAt.getTime() && s.state === "AVAILABLE");
      if (!slot) {
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
              bookingNumber: await this.lifecycle.nextBookingNumber(tx),
              variantId: origin.variantId,
              resourceId: slot.resourceId ?? null,
              bookingMode: origin.bookingMode,
              paymentMode: origin.paymentMode,
              priceAmount: origin.priceAmount,
              discountAmount: origin.discountAmount,
              currency: origin.currency,
              durationMinutes: origin.durationMinutes,
              serviceNameSnapshot: origin.serviceNameSnapshot,
              variantNameSnapshot: origin.variantNameSnapshot,
              cancellationPolicySnapshot: origin.cancellationPolicySnapshot,
              freeCancellationHours: origin.freeCancellationHours,
              lateCancellationRefundPercent: origin.lateCancellationRefundPercent,
              preparationSnapshot: origin.preparationSnapshot,
            },
          });
          await this.lifecycle.recordCreated(tx, created, BookingActorType.USER, userId);
          await this.events.publish(
            "ServiceBookingConfirmed",
            { ...bookingEventFields(created), bookingSeriesId: series.id },
            { tx, aggregateType: "Booking", aggregateId: created.id },
          );
          await this.petAccessGrants.grantForBooking(created, origin.providerUserId ?? undefined, scopePreset, tx, originConsented);
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

  /**
   * "Cancel this and all following": cancels every still-cancellable occurrence of the series that
   * starts at or after the chosen occurrence, each through the same cancel path (policy refund,
   * capacity release, timeline). Earlier and already-attended occurrences are untouched.
   */
  async cancelSeriesFrom(userId: string, bookingId: string, reason?: string): Promise<{ cancelledBookingIds: string[] }> {
    const anchor = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!anchor?.bookingSeriesId) throw new NotFoundApiException("Booking series");
    const effective = await this.petAccess.getEffectivePermissions(anchor.petId, userId);
    if (anchor.userId !== userId && !effective?.canBookCare) throw new PetAccessDeniedException({ bookingId });
    const occurrences = await this.prisma.booking.findMany({
      where: { bookingSeriesId: anchor.bookingSeriesId, startAt: { gte: anchor.startAt }, bookingStatus: { in: CANCELLABLE_STATUSES } },
      orderBy: { startAt: "asc" },
    });
    const cancelledBookingIds: string[] = [];
    for (const occurrence of occurrences) {
      await this.cancel(userId, occurrence.id, { reason: reason ?? "SERIES_CANCELLED_FROM_HERE" });
      cancelledBookingIds.push(occurrence.id);
    }
    const remaining = await this.prisma.booking.count({ where: { bookingSeriesId: anchor.bookingSeriesId, bookingStatus: { in: OCCUPYING_STATUSES } } });
    if (remaining === 0) await this.prisma.bookingSeries.update({ where: { id: anchor.bookingSeriesId }, data: { status: "CANCELLED" } });
    return { cancelledBookingIds };
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
      completedAt: booking.completedAt?.toISOString() ?? null,
      completedByProviderUserId: booking.completedByProviderUserId,
      completionNote: booking.completionNote,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      provider: toProviderSummaryDto(booking.providerOrganization),
      location: toProviderLocationDto(booking.providerLocation),
      service: toProviderServiceDto(booking.providerService),
      customerAddress: toAddressDto(booking.customerAddress),
      dropoffAddress: toAddressDto(booking.dropoffAddress),
      bookingSeriesId: booking.bookingSeriesId,
      petAccess: booking.petAccess ? this.toPetAccessSummary(booking.petAccess) : null,
      bookingNumber: booking.bookingNumber,
      variantId: booking.variantId,
      variantName: booking.variantNameSnapshot ?? booking.variant?.name ?? null,
      serviceName: booking.serviceNameSnapshot ?? booking.providerService.name,
      bookingMode: booking.bookingMode as unknown as BookingDto["bookingMode"],
      paymentMode: booking.paymentMode as unknown as BookingDto["paymentMode"],
      priceAmount: booking.priceAmount === null ? null : Number(booking.priceAmount),
      discountAmount: Number(booking.discountAmount),
      depositAmount: booking.depositAmount === null ? null : Number(booking.depositAmount),
      currency: booking.currency,
      durationMinutes: booking.durationMinutes,
      cancellationPolicy: booking.cancellationPolicySnapshot,
      freeCancellationHours: booking.freeCancellationHours,
      lateCancellationRefundPercent: booking.lateCancellationRefundPercent,
      preparation: booking.preparationSnapshot,
      requestExpiresAt: booking.requestExpiresAt?.toISOString() ?? null,
      rejectedReason: booking.rejectedReason,
      rescheduledFromBookingId: booking.rescheduledFromBookingId,
      rescheduledToBookingId: booking.rescheduledTo?.id ?? null,
      additionalPetIds: booking.additionalPets.map((p) => p.petId),
      timeline: booking.statusEvents.map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus as unknown as BookingDto["bookingStatus"] | null,
        toStatus: e.toStatus as unknown as BookingDto["bookingStatus"],
        actorType: e.actorType,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
      review: booking.review ?? null,
    };
  }

  private toPetAccessSummary(petAccess: NonNullable<BookingWithRelations["petAccess"]>): BookingPetAccessSummaryDto {
    return {
      scopePreset: petAccess.scopePreset as unknown as BookingPetAccessSummaryDto["scopePreset"],
      expiresAt: petAccess.petAccessGrant.expiresAt?.toISOString() ?? "",
    };
  }
}
