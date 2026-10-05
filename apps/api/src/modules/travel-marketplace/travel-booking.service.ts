import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { randomInt } from "node:crypto";
import {
  CartStatus,
  CheckoutStatus,
  PaymentMethodType,
  PaymentProvider,
  Prisma,
  TravelBookingMode,
  TravelBookingStatus,
  TravelListingStatus,
  TravelReviewStatus,
} from "@prisma/client";
import type { PaginatedDto, TravelBookingDto, TravelReviewDto, TripTravelSummaryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import {
  ApiException,
  InvalidTravelBookingTransitionException,
  NotFoundApiException,
  TravelBookingNotFoundException,
  TravelDatesUnavailableException,
  TravelInventoryUnitNotFoundException,
  TravelListingNotFoundException,
  TravelPetPolicyViolationException,
  TripNotFoundException,
  ValidationApiException,
} from "../../common/errors/api-exception";
import { PaymentsService } from "../commerce/payments/payments.service";
import type { PaymentChargeMode } from "../commerce/payments/payment-gateway.interface";
import { LedgerService } from "../commerce/ledger/ledger.service";
import { RefundsService } from "../commerce/refunds/refunds.service";
import { StorageService } from "../storage/storage.service";
import { BOOKING_INCLUDE, toTravelBookingDto, type BookingWithRelations } from "./travel-marketplace-mapper";
import { INVENTORY_HOLDING_STATUSES, TravelAvailabilityService } from "./travel-availability.service";
import { resolveStayRange, toDateKey, toUtcMidnight } from "./travel-date.util";
import { decideTravelRefund, toKg, type PetFacts, type RatePlanTerms } from "./travel-pricing.util";

export class TravelActionNotAllowedException extends ApiException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

/** A bounded inventory hold while the traveller finishes the flow. */
export const HOLD_MINUTES = 15;
/** How long a provider has to answer a request (capped at check-in). */
export const REQUEST_TTL_HOURS = 24;
/** Payment window after an instant booking is submitted / after a request is accepted. */
export const INSTANT_PAYMENT_WINDOW_MINUTES = 30;
export const ACCEPTED_PAYMENT_WINDOW_HOURS = 24;

const RELEASING_STATUSES: TravelBookingStatus[] = [
  TravelBookingStatus.CANCELLED,
  TravelBookingStatus.REJECTED,
  TravelBookingStatus.EXPIRED,
  TravelBookingStatus.REFUNDED,
  TravelBookingStatus.MODIFIED,
];

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Ambiguous characters (0/O, 1/I) are excluded so a reference read aloud to support lands correctly. */
function generateReference(): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `TR-${suffix}`;
}

export type TravelActor = { type: "TRAVELER" | "PROVIDER" | "ADMIN" | "SYSTEM"; id: string | null };

export interface HoldInput {
  listingId: string;
  unitId: string;
  ratePlanId?: string;
  checkIn: string;
  checkOut: string;
  petIds?: string[];
  guests?: number;
}

/**
 * The travel marketplace's demand side (Batch 5).
 *
 * Every live booking — including a HELD booking while the traveller finishes
 * the flow — owns one TravelBookedNight row per (unit, night, slot), and
 * `@@unique([unitId, night, slot])` means two racing requests for the last
 * room cannot both succeed. Price, rate terms and the pet policy are
 * snapshotted at hold time; later listing edits never rewrite a booking.
 * Money only moves through H07 (Checkout shell → PaymentIntent → gateway) and
 * the existing Refund architecture.
 */
@Injectable()
export class TravelBookingService {
  private readonly logger = new Logger(TravelBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly availability: TravelAvailabilityService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly refunds: RefundsService,
    private readonly storage: StorageService,
  ) {}

  // --- Access -----------------------------------------------------------------

  private async householdIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.householdMember.findMany({ where: { userId }, select: { householdId: true } });
    return rows.map((r) => r.householdId);
  }

  /** Owner-scoped load. A booking outside the caller's households is simply "not found" (no existence leak). */
  private async loadForTraveler(userId: string, bookingId: string): Promise<BookingWithRelations> {
    const row = await this.prisma.travelBooking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!row) throw new TravelBookingNotFoundException({ bookingId });
    const households = await this.householdIdsOf(userId);
    if (!households.includes(row.householdId)) throw new TravelBookingNotFoundException({ bookingId });
    return row;
  }

  async loadForOrganization(organizationId: string, bookingId: string): Promise<BookingWithRelations> {
    const row = await this.prisma.travelBooking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!row || row.listing.organizationId !== organizationId) throw new TravelBookingNotFoundException({ bookingId });
    return row;
  }

  toDto(row: BookingWithRelations): TravelBookingDto {
    const plan = row.ratePlanSnapshot as unknown as RatePlanTerms | null;
    const paid = row.paymentStatus === "PAID" ? row.payNowAmountIrr : 0;
    const cancellable = ([TravelBookingStatus.HELD, TravelBookingStatus.AWAITING_PROVIDER, TravelBookingStatus.AWAITING_PAYMENT, TravelBookingStatus.CONFIRMED] as TravelBookingStatus[]).includes(row.status) && row.checkIn.getTime() > Date.now();
    const modifiable =
      row.status === TravelBookingStatus.CONFIRMED && row.checkIn.getTime() > Date.now() && plan?.cancellationType !== "NON_REFUNDABLE";
    const reviewable = row.status === TravelBookingStatus.COMPLETED && !row.review;
    return toTravelBookingDto(row, {
      canCancel: cancellable,
      canModify: modifiable,
      canReview: reviewable,
      refundPreviewIrr: cancellable ? decideTravelRefund(plan, row.checkIn, paid, false).amountIrr : null,
    });
  }

  // --- Hold -------------------------------------------------------------------

  private async loadPets(userId: string, petIds: string[]): Promise<{ householdId: string | null; pets: (PetFacts & { householdId: string })[] }> {
    if (petIds.length === 0) return { householdId: null, pets: [] };
    const households = await this.householdIdsOf(userId);
    const rows = await this.prisma.pet.findMany({
      where: { id: { in: petIds }, householdId: { in: households } },
      select: { id: true, name: true, species: true, latestWeightValue: true, latestWeightUnit: true, householdId: true },
    });
    // A pet id the caller cannot see is never silently dropped.
    if (rows.length !== new Set(petIds).size) throw new NotFoundApiException("Pet");
    const householdIds = new Set(rows.map((r) => r.householdId));
    if (householdIds.size > 1) throw new ValidationApiException({ field: "petIds", reason: "PETS_FROM_DIFFERENT_HOUSEHOLDS" });
    return {
      householdId: rows[0]!.householdId,
      pets: rows.map((r) => ({ id: r.id, name: r.name, species: r.species, weightKg: toKg(r.latestWeightValue, r.latestWeightUnit), householdId: r.householdId })),
    };
  }

  /** Public-safe pet facts for quoting: only pets the caller owns. */
  async petFactsFor(userId: string | undefined, petIds: string[]): Promise<PetFacts[]> {
    if (!userId || petIds.length === 0) return [];
    return (await this.loadPets(userId, petIds)).pets;
  }

  async hold(userId: string, input: HoldInput): Promise<TravelBookingDto> {
    const listing = await this.prisma.travelListing.findFirst({ where: { id: input.listingId, status: TravelListingStatus.PUBLISHED, isPubliclyListed: true }, include: { petPolicy: true } });
    if (!listing) throw new TravelListingNotFoundException({ listingId: input.listingId });
    const unit = await this.prisma.travelInventoryUnit.findFirst({ where: { id: input.unitId, listingId: listing.id, isActive: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId: input.unitId, listingId: listing.id });

    const today = toUtcMidnight(new Date());
    if (toUtcMidnight(input.checkIn) < today) throw new ValidationApiException({ field: "checkIn", reason: "CHECK_IN_IN_PAST" });
    const guests = input.guests ?? 1;
    if (unit.maxOccupancy !== null && guests > unit.maxOccupancy) throw new ValidationApiException({ field: "guests", reason: "OVER_UNIT_CAPACITY", maxOccupancy: unit.maxOccupancy });

    const { householdId: petHousehold, pets } = await this.loadPets(userId, input.petIds ?? []);
    const householdId = petHousehold ?? (await this.householdIdsOf(userId))[0];
    if (!householdId) throw new ValidationApiException({ field: "household", reason: "HOUSEHOLD_REQUIRED" });

    const perTrip = listing.pricingMode === "PER_TRIP";
    const { checkIn, checkOut, nights } = resolveStayRange(input.checkIn, input.checkOut, perTrip);

    const created = await this.prisma.$transaction(async (tx) => {
      // Re-priced and re-validated inside the transaction that holds the nights.
      const quote = await this.availability.quote(listing.id, unit.id, toDateKey(checkIn), toDateKey(checkOut), pets, input.ratePlanId ?? null, tx);
      if (!quote.isBookable) throw new TravelDatesUnavailableException({ listingId: listing.id, unitId: unit.id, unavailableDate: quote.unavailableDate });
      if (quote.petPolicyMatch?.outcome === "POTENTIAL_CONFLICT") throw new TravelPetPolicyViolationException({ reasons: quote.petPolicyMatch.reasons });

      const plan = quote.ratePlan;
      const booking = await tx.travelBooking.create({
        data: {
          listingId: listing.id,
          unitId: unit.id,
          reference: generateReference(),
          householdId,
          bookedByUserId: userId,
          status: TravelBookingStatus.HELD,
          checkIn,
          checkOut,
          guests,
          nights: quote.nights,
          baseAmountIrr: quote.baseAmountIrr,
          petFeeAmountIrr: quote.petFeeAmountIrr,
          depositAmountIrr: quote.depositAmountIrr,
          totalAmountIrr: quote.totalAmountIrr,
          payNowAmountIrr: quote.payNowAmountIrr,
          discountAmountIrr: quote.discountAmountIrr,
          cancellationPolicySnapshot: listing.cancellationPolicy,
          ratePlanId: plan?.id ?? null,
          ratePlanSnapshot: plan ? (snapshotPlan(plan) as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          petPolicySnapshot: listing.petPolicy ? (snapshotPolicy(listing.petPolicy) as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          priceBreakdownSnapshot: quote.breakdown as unknown as Prisma.InputJsonValue,
          holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
          paymentStatus: "NOT_REQUIRED",
          pets: { create: pets.map((p) => ({ petId: p.id })) },
          statusEvents: { create: { fromStatus: null, toStatus: TravelBookingStatus.HELD, actorType: "TRAVELER", actorId: userId, reason: quote.petPolicyMatch?.outcome ?? null } },
        },
        include: BOOKING_INCLUDE,
      });
      await this.holdNights(tx, unit.id, booking.id, nights, unit.quantity);
      return booking;
    });
    return this.toDto(created);
  }

  /**
   * Claims one slot per night. A concurrent transaction that already claimed
   * the same slot makes this insert fail with P2002 → TRAVEL_DATES_UNAVAILABLE.
   */
  private async holdNights(tx: Prisma.TransactionClient, unitId: string, bookingId: string, nights: Date[], quantity: number): Promise<void> {
    for (const night of nights) {
      const taken = await tx.travelBookedNight.findMany({ where: { unitId, night }, select: { slot: true } });
      const takenSlots = new Set(taken.map((row) => row.slot));
      const slot = Array.from({ length: quantity }, (_, index) => index).find((candidate) => !takenSlots.has(candidate));
      if (slot === undefined) throw new TravelDatesUnavailableException({ unitId, night: toDateKey(night), reason: "NO_SLOT_REMAINING" });
      try {
        await tx.travelBookedNight.create({ data: { unitId, bookingId, night, slot } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TravelDatesUnavailableException({ unitId, night: toDateKey(night), reason: "CONCURRENT_BOOKING" });
        }
        throw error;
      }
    }
  }

  // --- Submit / pay ------------------------------------------------------------

  async submit(userId: string, bookingId: string, input: { travelerNote?: string; tripId?: string; acknowledgeMissingInfo?: boolean }): Promise<TravelBookingDto> {
    const row = await this.loadForTraveler(userId, bookingId);
    if (row.status !== TravelBookingStatus.HELD) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: "SUBMITTED" });
    if (row.holdExpiresAt && row.holdExpiresAt <= new Date()) throw new TravelActionNotAllowedException("TRAVEL_HOLD_EXPIRED", "Your hold on these dates expired. Please choose the dates again.", { bookingId });
    const firstEvent = row.statusEvents[0];
    if (firstEvent?.reason === "MORE_INFO_NEEDED" && !input.acknowledgeMissingInfo) {
      throw new ValidationApiException({ field: "acknowledgeMissingInfo", reason: "PET_POLICY_CONFIRMATION_REQUIRED" });
    }
    if (input.tripId) {
      const trip = await this.prisma.trip.findFirst({ where: { id: input.tripId, householdId: row.householdId }, select: { id: true } });
      if (!trip) throw new TripNotFoundException({ tripId: input.tripId });
    }
    const listing = await this.prisma.travelListing.findUniqueOrThrow({ where: { id: row.listingId }, select: { bookingMode: true, organizationId: true } });
    const now = new Date();
    let to: TravelBookingStatus;
    const data: Prisma.TravelBookingUncheckedUpdateManyInput = { holdExpiresAt: null, travelerNote: input.travelerNote ?? null, ...(input.tripId ? { tripId: input.tripId } : {}) };
    if (listing.bookingMode === TravelBookingMode.REQUEST_TO_BOOK) {
      to = TravelBookingStatus.AWAITING_PROVIDER;
      data.requestExpiresAt = new Date(Math.min(now.getTime() + REQUEST_TTL_HOURS * 3600_000, row.checkIn.getTime()));
    } else if (row.payNowAmountIrr > 0) {
      to = TravelBookingStatus.AWAITING_PAYMENT;
      data.paymentStatus = "AWAITING";
      data.requestExpiresAt = new Date(now.getTime() + INSTANT_PAYMENT_WINDOW_MINUTES * 60_000);
    } else {
      to = TravelBookingStatus.CONFIRMED;
      data.confirmedAt = now;
      data.paymentStatus = row.totalAmountIrr > 0 ? "PAY_AT_PROPERTY" : "NOT_REQUIRED";
    }
    await this.move(row, to, { type: "TRAVELER", id: userId }, null, data);
    return this.toDto(await this.loadForTraveler(userId, bookingId));
  }

  /**
   * Pays the booking's pay-now amount through H07. Only a SUCCEEDED gateway
   * result confirms; FAILED keeps it awaiting payment (retryable within the
   * window); PENDING leaves it for the webhook. The gateway is whatever
   * PAYMENT_SANDBOX_MODE configures — nothing here reports success the
   * gateway did not report.
   */
  async pay(userId: string, bookingId: string, input: { provider?: PaymentProvider; mode?: string }): Promise<TravelBookingDto> {
    const row = await this.loadForTraveler(userId, bookingId);
    if (row.status !== TravelBookingStatus.AWAITING_PAYMENT) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.CONFIRMED });
    if (row.requestExpiresAt && row.requestExpiresAt <= new Date()) throw new TravelActionNotAllowedException("TRAVEL_PAYMENT_WINDOW_EXPIRED", "The payment window for this booking has closed.", { bookingId });
    const amount = row.payNowAmountIrr;
    if (amount <= 0) throw new ValidationApiException({ field: "amount", reason: "NOTHING_TO_PAY" });

    const intentId = await this.prisma.$transaction(async (tx) => {
      // One intent per booking even when pay is tapped twice (see BookingsService.pay).
      await tx.$queryRaw`SELECT id FROM "travel_bookings" WHERE id = ${bookingId}::uuid FOR UPDATE`;
      const current = await tx.travelBooking.findUniqueOrThrow({ where: { id: bookingId }, select: { paymentIntentId: true, status: true } });
      if (current.status !== TravelBookingStatus.AWAITING_PAYMENT) throw new InvalidTravelBookingTransitionException({ bookingId, from: current.status, to: TravelBookingStatus.CONFIRMED });
      if (current.paymentIntentId) {
        const existing = await tx.paymentIntent.findUniqueOrThrow({ where: { id: current.paymentIntentId } });
        if (existing.status !== "FAILED" && existing.status !== "CANCELLED") return existing.id;
      }
      const cart = await tx.cart.create({ data: { userId, status: CartStatus.CONVERTED } });
      const checkout = await tx.checkout.create({
        data: { userId, householdId: row.householdId, cartId: cart.id, paymentMethodType: PaymentMethodType.ONLINE_PAYMENT, status: CheckoutStatus.READY_FOR_PAYMENT, subtotalAmount: amount, totalAmount: amount, currency: "IRR" },
      });
      const intent = await this.payments.createIntent(checkout.id, amount, "IRR", input.provider ?? PaymentProvider.DEV_SIMULATED, `travel:${bookingId}:${Date.now()}`, tx);
      await tx.travelBooking.update({ where: { id: bookingId }, data: { paymentIntentId: intent.id } });
      return intent.id;
    });

    const outcome = await this.payments.charge(intentId, input.mode as PaymentChargeMode | undefined);
    if (outcome.status === "SUCCEEDED") {
      await this.prisma.$transaction(async (tx) => {
        // Guard against a concurrent expiry/cancel: only an AWAITING_PAYMENT booking becomes CONFIRMED.
        const moved = await tx.travelBooking.updateMany({ where: { id: bookingId, status: TravelBookingStatus.AWAITING_PAYMENT }, data: { status: TravelBookingStatus.CONFIRMED, paymentStatus: "PAID", confirmedAt: new Date(), requestExpiresAt: null } });
        const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
        await this.ledger.recordPaymentSucceeded(intent.checkoutId, amount, "IRR", tx);
        if (moved.count === 1) {
          await tx.travelBookingEvent.create({ data: { bookingId, fromStatus: TravelBookingStatus.AWAITING_PAYMENT, toStatus: TravelBookingStatus.CONFIRMED, actorType: "TRAVELER", actorId: userId, reason: "PAID" } });
          await this.publish(tx, "TravelBookingConfirmed", row, { paid: amount });
        } else {
          // Paid after the booking left AWAITING_PAYMENT (expired/cancelled in between): mark for refund, never confirm silently.
          await tx.travelBooking.update({ where: { id: bookingId }, data: { paymentStatus: "REFUND_PENDING" } });
        }
      });
      const after = await this.prisma.travelBooking.findUniqueOrThrow({ where: { id: bookingId } });
      if (after.paymentStatus === "REFUND_PENDING") await this.executeRefund(bookingId, amount, "PAID_AFTER_EXPIRY", userId);
    } else if (outcome.status === "FAILED") {
      await this.prisma.travelBooking.update({ where: { id: bookingId }, data: { paymentStatus: "FAILED" } });
    }
    return this.toDto(await this.loadForTraveler(userId, bookingId));
  }

  // --- Cancel / modify ----------------------------------------------------------

  async cancelAsTraveler(userId: string, bookingId: string, reason?: string): Promise<TravelBookingDto> {
    const row = await this.loadForTraveler(userId, bookingId);
    const allowed: TravelBookingStatus[] = [TravelBookingStatus.HELD, TravelBookingStatus.AWAITING_PROVIDER, TravelBookingStatus.AWAITING_PAYMENT, TravelBookingStatus.CONFIRMED];
    if (!allowed.includes(row.status) || row.checkIn.getTime() <= Date.now()) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.CANCELLED });
    await this.cancel(row, { type: "TRAVELER", id: userId }, reason ?? null, false);
    return this.toDto(await this.loadForTraveler(userId, bookingId));
  }

  async cancelAsProvider(organizationId: string, actorUserId: string, bookingId: string, reason: string): Promise<TravelBookingDto> {
    const row = await this.loadForOrganization(organizationId, bookingId);
    const allowed: TravelBookingStatus[] = [TravelBookingStatus.AWAITING_PAYMENT, TravelBookingStatus.CONFIRMED];
    if (!allowed.includes(row.status)) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.CANCELLED });
    await this.cancel(row, { type: "PROVIDER", id: actorUserId }, reason, true);
    return this.toDto(await this.loadForOrganization(organizationId, bookingId));
  }

  /** Cancels (releasing inventory in the same transaction) and then refunds what the snapshotted terms allow. */
  private async cancel(row: BookingWithRelations, actor: TravelActor, reason: string | null, byProvider: boolean): Promise<void> {
    const paid = row.paymentStatus === "PAID" ? row.payNowAmountIrr : 0;
    const decision = decideTravelRefund(row.ratePlanSnapshot as unknown as RatePlanTerms | null, row.checkIn, paid, byProvider);
    await this.move(row, TravelBookingStatus.CANCELLED, actor, reason, {
      cancelledAt: new Date(),
      cancelReason: reason,
      cancelledBy: actor.type,
      ...(decision.amountIrr > 0 ? { paymentStatus: "REFUND_PENDING" } : {}),
    });
    if (decision.amountIrr > 0) await this.executeRefund(row.id, decision.amountIrr, `TRAVEL_CANCELLATION:${row.reference}:${decision.percent}%`, actor.id);
  }

  /** Executes a gateway refund; a failure leaves REFUND_PENDING visible to finance/ops, never "refunded". */
  private async executeRefund(bookingId: string, amountIrr: number, reason: string, userId: string | null): Promise<void> {
    const booking = await this.prisma.travelBooking.findUniqueOrThrow({ where: { id: bookingId } });
    if (!booking.paymentIntentId) return;
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: booking.paymentIntentId } });
    try {
      await this.refunds.refundStandalonePayment(intent.checkoutId, amountIrr, "IRR", reason, userId);
      await this.prisma.travelBooking.update({
        where: { id: bookingId },
        data: { refundAmountIrr: amountIrr, paymentStatus: amountIrr >= booking.payNowAmountIrr ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });
      await this.prisma.travelBookingEvent.create({ data: { bookingId, fromStatus: booking.status, toStatus: booking.status, actorType: "SYSTEM", reason: `REFUNDED:${amountIrr}` } });
    } catch (error) {
      this.logger.warn(`Travel refund failed for ${bookingId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Changes dates (and optionally unit/rate) safely: in ONE transaction the
   * old booking becomes MODIFIED and releases its nights, and the successor
   * holds the new nights. If the new nights cannot be held the transaction
   * rolls back and the original booking is untouched. Only allowed when the
   * amount due online does not change — otherwise the traveller cancels and
   * rebooks under the stated terms (no silent charge, no silent refund).
   */
  async modify(userId: string, bookingId: string, input: { checkIn: string; checkOut: string; unitId?: string; ratePlanId?: string }): Promise<TravelBookingDto> {
    const row = await this.loadForTraveler(userId, bookingId);
    const plan = row.ratePlanSnapshot as unknown as RatePlanTerms | null;
    if (row.status !== TravelBookingStatus.CONFIRMED || row.checkIn.getTime() <= Date.now()) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.MODIFIED });
    if (plan?.cancellationType === "NON_REFUNDABLE") throw new TravelActionNotAllowedException("TRAVEL_MODIFICATION_NOT_ALLOWED", "Non-refundable bookings cannot be changed.", { bookingId });
    if (toUtcMidnight(input.checkIn) < toUtcMidnight(new Date())) throw new ValidationApiException({ field: "checkIn", reason: "CHECK_IN_IN_PAST" });

    const unitId = input.unitId ?? row.unitId;
    const ratePlanId = input.ratePlanId ?? (unitId === row.unitId ? row.ratePlanId : null);
    const unit = await this.prisma.travelInventoryUnit.findFirst({ where: { id: unitId, listingId: row.listingId, isActive: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId, listingId: row.listingId });
    const listing = await this.prisma.travelListing.findUniqueOrThrow({ where: { id: row.listingId }, select: { pricingMode: true } });
    const petIds = row.pets.map((p) => p.petId);
    const pets = (await this.loadPets(userId, petIds)).pets;
    const { checkIn, checkOut, nights } = resolveStayRange(input.checkIn, input.checkOut, listing.pricingMode === "PER_TRIP");

    const successorId = await this.prisma.$transaction(async (tx) => {
      // Release first inside the transaction so overlapping nights of the same unit can be re-held.
      await tx.travelBookedNight.deleteMany({ where: { bookingId } });
      const quote = await this.availability.quote(row.listingId, unitId, toDateKey(checkIn), toDateKey(checkOut), pets, ratePlanId, tx);
      if (!quote.isBookable) throw new TravelDatesUnavailableException({ unavailableDate: quote.unavailableDate });
      if (quote.petPolicyMatch?.outcome === "POTENTIAL_CONFLICT") throw new TravelPetPolicyViolationException({ reasons: quote.petPolicyMatch.reasons });
      if (row.paymentStatus === "PAID" && quote.payNowAmountIrr !== row.payNowAmountIrr) {
        throw new TravelActionNotAllowedException("TRAVEL_MODIFICATION_REQUIRES_REBOOKING", "The new stay changes the amount due. Cancel under your booking's terms and book again.", {
          currentPayNowIrr: row.payNowAmountIrr,
          newPayNowIrr: quote.payNowAmountIrr,
          differenceIrr: quote.payNowAmountIrr - row.payNowAmountIrr,
        });
      }
      await tx.travelBooking.update({ where: { id: bookingId }, data: { status: TravelBookingStatus.MODIFIED } });
      await tx.travelBookingEvent.create({ data: { bookingId, fromStatus: row.status, toStatus: TravelBookingStatus.MODIFIED, actorType: "TRAVELER", actorId: userId, reason: `${toDateKey(checkIn)}→${toDateKey(checkOut)}` } });
      const successor = await tx.travelBooking.create({
        data: {
          listingId: row.listingId,
          unitId,
          reference: generateReference(),
          householdId: row.householdId,
          bookedByUserId: row.bookedByUserId,
          tripId: row.tripId,
          status: TravelBookingStatus.CONFIRMED,
          checkIn,
          checkOut,
          guests: row.guests,
          nights: quote.nights,
          baseAmountIrr: quote.baseAmountIrr,
          petFeeAmountIrr: quote.petFeeAmountIrr,
          depositAmountIrr: quote.depositAmountIrr,
          totalAmountIrr: quote.totalAmountIrr,
          payNowAmountIrr: quote.payNowAmountIrr,
          discountAmountIrr: quote.discountAmountIrr,
          cancellationPolicySnapshot: row.cancellationPolicySnapshot,
          ratePlanId: quote.ratePlan?.id ?? null,
          ratePlanSnapshot: quote.ratePlan ? (snapshotPlan(quote.ratePlan) as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          petPolicySnapshot: (row.petPolicySnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          priceBreakdownSnapshot: quote.breakdown as unknown as Prisma.InputJsonValue,
          paymentIntentId: row.paymentIntentId,
          paymentStatus: row.paymentStatus,
          travelerNote: row.travelerNote,
          confirmedAt: new Date(),
          modifiedFromBookingId: bookingId,
          pets: { create: petIds.map((petId) => ({ petId })) },
          statusEvents: { create: { fromStatus: null, toStatus: TravelBookingStatus.CONFIRMED, actorType: "TRAVELER", actorId: userId, reason: `MODIFIED_FROM:${row.reference}` } },
        },
      });
      await this.holdNights(tx, unitId, successor.id, nights, unit.quantity);
      await tx.travelBookingDocumentShare.updateMany({ where: { bookingId, revokedAt: null }, data: { bookingId: successor.id } });
      await this.publish(tx, "TravelBookingChanged", { ...row, id: successor.id, reference: successor.reference }, { previousBookingId: bookingId });
      return successor.id;
    });
    return this.toDto(await this.loadForTraveler(userId, successorId));
  }

  // --- Provider actions ----------------------------------------------------------

  async accept(organizationId: string, actorUserId: string, bookingId: string, note?: string): Promise<TravelBookingDto> {
    const row = await this.loadForOrganization(organizationId, bookingId);
    if (row.status !== TravelBookingStatus.AWAITING_PROVIDER) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.CONFIRMED });
    if (row.requestExpiresAt && row.requestExpiresAt <= new Date()) throw new TravelActionNotAllowedException("TRAVEL_REQUEST_EXPIRED", "This request has expired.", { bookingId });
    const now = new Date();
    if (row.payNowAmountIrr > 0) {
      await this.move(row, TravelBookingStatus.AWAITING_PAYMENT, { type: "PROVIDER", id: actorUserId }, note ?? null, {
        respondedAt: now,
        providerNote: note ?? null,
        paymentStatus: "AWAITING",
        requestExpiresAt: new Date(Math.min(now.getTime() + ACCEPTED_PAYMENT_WINDOW_HOURS * 3600_000, row.checkIn.getTime())),
      });
    } else {
      await this.move(row, TravelBookingStatus.CONFIRMED, { type: "PROVIDER", id: actorUserId }, note ?? null, {
        respondedAt: now,
        confirmedAt: now,
        providerNote: note ?? null,
        requestExpiresAt: null,
        paymentStatus: row.totalAmountIrr > 0 ? "PAY_AT_PROPERTY" : "NOT_REQUIRED",
      });
    }
    return this.toDto(await this.loadForOrganization(organizationId, bookingId));
  }

  async reject(organizationId: string, actorUserId: string, bookingId: string, reason: string): Promise<TravelBookingDto> {
    const row = await this.loadForOrganization(organizationId, bookingId);
    if (row.status !== TravelBookingStatus.AWAITING_PROVIDER) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.REJECTED });
    await this.move(row, TravelBookingStatus.REJECTED, { type: "PROVIDER", id: actorUserId }, reason, { respondedAt: new Date(), providerNote: reason, requestExpiresAt: null });
    return this.toDto(await this.loadForOrganization(organizationId, bookingId));
  }

  async checkIn(organizationId: string, actorUserId: string, bookingId: string): Promise<TravelBookingDto> {
    const row = await this.loadForOrganization(organizationId, bookingId);
    if (row.status !== TravelBookingStatus.CONFIRMED || toUtcMidnight(new Date()) < row.checkIn) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.IN_PROGRESS });
    await this.move(row, TravelBookingStatus.IN_PROGRESS, { type: "PROVIDER", id: actorUserId }, null, {});
    return this.toDto(await this.loadForOrganization(organizationId, bookingId));
  }

  async complete(organizationId: string, actorUserId: string, bookingId: string): Promise<TravelBookingDto> {
    const row = await this.loadForOrganization(organizationId, bookingId);
    if (row.status !== TravelBookingStatus.IN_PROGRESS) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.COMPLETED });
    await this.move(row, TravelBookingStatus.COMPLETED, { type: "PROVIDER", id: actorUserId }, null, { completedAt: new Date() });
    return this.toDto(await this.loadForOrganization(organizationId, bookingId));
  }

  /** No-show: only after the check-in date passed on a confirmed stay; no automatic refund (terms apply), audited on the timeline. */
  async noShow(organizationId: string, actorUserId: string, bookingId: string, note?: string): Promise<TravelBookingDto> {
    const row = await this.loadForOrganization(organizationId, bookingId);
    const yesterday = toUtcMidnight(new Date(Date.now() - 86_400_000));
    if (row.status !== TravelBookingStatus.CONFIRMED || row.checkIn > yesterday) throw new InvalidTravelBookingTransitionException({ bookingId, from: row.status, to: TravelBookingStatus.NO_SHOW, reason: "ONLY_AFTER_CHECK_IN_DAY" });
    await this.move(row, TravelBookingStatus.NO_SHOW, { type: "PROVIDER", id: actorUserId }, note ?? null, { noShowAt: new Date() });
    // Nights after today go back on the market; past nights stay as history.
    await this.prisma.travelBookedNight.deleteMany({ where: { bookingId, night: { gte: toUtcMidnight(new Date()) } } });
    return this.toDto(await this.loadForOrganization(organizationId, bookingId));
  }

  // --- Shared transition ----------------------------------------------------------

  /** Optimistic status move + timeline row + inventory release + domain event, all in one transaction. */
  private async move(row: BookingWithRelations, to: TravelBookingStatus, actor: TravelActor, reason: string | null, data: Prisma.TravelBookingUncheckedUpdateManyInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.travelBooking.updateMany({ where: { id: row.id, status: row.status }, data: { ...data, status: to } });
      if (res.count === 0) throw new InvalidTravelBookingTransitionException({ bookingId: row.id, reason: "CHANGED_CONCURRENTLY" });
      await tx.travelBookingEvent.create({ data: { bookingId: row.id, fromStatus: row.status, toStatus: to, actorType: actor.type, actorId: actor.id, reason } });
      if (RELEASING_STATUSES.includes(to)) await tx.travelBookedNight.deleteMany({ where: { bookingId: row.id } });
      const eventName: Record<string, string> = {
        [TravelBookingStatus.AWAITING_PROVIDER]: "TravelBookingRequested",
        [TravelBookingStatus.AWAITING_PAYMENT]: "TravelBookingPaymentRequired",
        [TravelBookingStatus.CONFIRMED]: "TravelBookingConfirmed",
        [TravelBookingStatus.REJECTED]: "TravelBookingRejected",
        [TravelBookingStatus.CANCELLED]: "TravelBookingCancelled",
        [TravelBookingStatus.COMPLETED]: "TravelBookingCompleted",
        [TravelBookingStatus.EXPIRED]: "TravelBookingExpired",
        [TravelBookingStatus.NO_SHOW]: "TravelBookingNoShow",
      };
      if (eventName[to]) await this.publish(tx, eventName[to]!, row, { from: row.status, to, cancelledBy: actor.type });
    });
  }

  /** Domain events carry what listeners need (they run before commit and must not re-read). */
  private async publish(tx: Prisma.TransactionClient, name: string, row: { id: string; reference: string; listingId: string; householdId: string; bookedByUserId: string; listing: { title: string; organizationId: string } }, extra: Record<string, unknown>): Promise<void> {
    await this.events.publish(
      name as never,
      { bookingId: row.id, reference: row.reference, listingId: row.listingId, listingTitle: row.listing.title, organizationId: row.listing.organizationId, householdId: row.householdId, userId: row.bookedByUserId, ...extra },
      { tx, aggregateType: "TravelBooking", aggregateId: row.id },
    );
  }

  // --- Expiry ---------------------------------------------------------------------

  /** Releases lapsed holds, unanswered requests and unpaid bookings; completes finished stays. Nothing is ever auto-confirmed. */
  async processExpiries(now = new Date()): Promise<{ expired: number; completed: number }> {
    const lapsed = await this.prisma.travelBooking.findMany({
      where: {
        OR: [
          { status: TravelBookingStatus.HELD, holdExpiresAt: { lte: now } },
          { status: { in: [TravelBookingStatus.AWAITING_PROVIDER, TravelBookingStatus.AWAITING_PAYMENT] }, requestExpiresAt: { lte: now } },
        ],
      },
      include: BOOKING_INCLUDE,
      take: 200,
    });
    let expired = 0;
    for (const row of lapsed) {
      try {
        await this.move(row, TravelBookingStatus.EXPIRED, { type: "SYSTEM", id: null }, row.status === TravelBookingStatus.HELD ? "HOLD_EXPIRED" : row.status === TravelBookingStatus.AWAITING_PROVIDER ? "PROVIDER_DID_NOT_RESPOND" : "PAYMENT_NOT_COMPLETED", { holdExpiresAt: null, requestExpiresAt: null });
        expired++;
      } catch {
        // A concurrent accept/payment/cancel won; that outcome stands.
      }
    }
    const finished = await this.prisma.travelBooking.findMany({
      where: { status: { in: [TravelBookingStatus.CONFIRMED, TravelBookingStatus.IN_PROGRESS] }, checkOut: { lt: new Date(now.getTime() - 86_400_000) } },
      include: BOOKING_INCLUDE,
      take: 200,
    });
    let completed = 0;
    for (const row of finished) {
      try {
        await this.move(row, TravelBookingStatus.COMPLETED, { type: "SYSTEM", id: null }, "STAY_ENDED", { completedAt: now });
        completed++;
      } catch {
        /* concurrent change */
      }
    }
    return { expired, completed };
  }

  // --- Reads -----------------------------------------------------------------------

  async listForUser(userId: string, query: { page?: number; pageSize?: number; status?: string; scope?: string }): Promise<PaginatedDto<TravelBookingDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const households = await this.householdIdsOf(userId);
    const today = toUtcMidnight(new Date());
    const where: Prisma.TravelBookingWhereInput = {
      householdId: { in: households },
      status: { not: TravelBookingStatus.MODIFIED },
      ...(query.status && query.status in TravelBookingStatus ? { status: query.status as TravelBookingStatus } : {}),
      ...(query.scope === "upcoming" ? { checkOut: { gte: today }, status: { in: [TravelBookingStatus.HELD, TravelBookingStatus.AWAITING_PROVIDER, TravelBookingStatus.AWAITING_PAYMENT, TravelBookingStatus.CONFIRMED, TravelBookingStatus.IN_PROGRESS] } } : {}),
      ...(query.scope === "past" ? { OR: [{ checkOut: { lt: today } }, { status: { in: [TravelBookingStatus.COMPLETED, TravelBookingStatus.CANCELLED, TravelBookingStatus.REJECTED, TravelBookingStatus.EXPIRED, TravelBookingStatus.NO_SHOW] } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelBooking.findMany({ where, include: BOOKING_INCLUDE, orderBy: [{ checkIn: query.scope === "past" ? "desc" : "asc" }, { id: "asc" }], skip, take }),
      this.prisma.travelBooking.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => this.toDto(r)), total, page, pageSize);
  }

  async getForUser(userId: string, bookingId: string): Promise<TravelBookingDto> {
    return this.toDto(await this.loadForTraveler(userId, bookingId));
  }

  async listForOrganization(organizationId: string, query: { page?: number; pageSize?: number; status?: string }): Promise<PaginatedDto<TravelBookingDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.TravelBookingWhereInput = {
      listing: { organizationId },
      status: query.status && query.status in TravelBookingStatus ? (query.status as TravelBookingStatus) : { notIn: [TravelBookingStatus.HELD, TravelBookingStatus.MODIFIED] },
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelBooking.findMany({ where, include: BOOKING_INCLUDE, orderBy: [{ checkIn: "asc" }, { id: "asc" }], skip, take }),
      this.prisma.travelBooking.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => this.toDto(r)), total, page, pageSize);
  }

  async getTripTravelSummary(tripId: string, householdId: string): Promise<TripTravelSummaryDto> {
    const rows = await this.prisma.travelBooking.findMany({ where: { tripId, householdId, status: { not: TravelBookingStatus.MODIFIED } }, include: BOOKING_INCLUDE, orderBy: { checkIn: "asc" } });
    const bookings = rows.map((r) => this.toDto(r));
    const active = rows.filter((row) => INVENTORY_HOLDING_STATUSES.includes(row.status) && row.status !== TravelBookingStatus.COMPLETED && row.status !== TravelBookingStatus.HELD);
    return { tripId, bookings, activeCount: active.length, totalCommittedIrr: active.reduce((sum, row) => sum + row.totalAmountIrr, 0) };
  }

  async attachToTrip(userId: string, bookingId: string, tripId: string): Promise<TravelBookingDto> {
    const row = await this.loadForTraveler(userId, bookingId);
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, householdId: row.householdId }, select: { id: true } });
    if (!trip) throw new TripNotFoundException({ tripId });
    await this.prisma.travelBooking.update({ where: { id: bookingId }, data: { tripId } });
    return this.toDto(await this.loadForTraveler(userId, bookingId));
  }

  // --- Reviews --------------------------------------------------------------------

  async review(userId: string, bookingId: string, input: { overall: number; petFriendliness?: number; cleanliness?: number; location?: number; accuracy?: number; body?: string }): Promise<TravelReviewDto> {
    const row = await this.loadForTraveler(userId, bookingId);
    if (row.status !== TravelBookingStatus.COMPLETED) throw new TravelActionNotAllowedException("TRAVEL_REVIEW_NOT_ALLOWED", "Only completed stays can be reviewed.", { bookingId });
    if (row.review) throw new TravelActionNotAllowedException("TRAVEL_REVIEW_NOT_ALLOWED", "This stay has already been reviewed.", { bookingId });
    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.travelReview.create({
          data: { bookingId, listingId: row.listingId, userId, overall: input.overall, petFriendliness: input.petFriendliness ?? null, cleanliness: input.cleanliness ?? null, location: input.location ?? null, accuracy: input.accuracy ?? null, body: input.body?.trim() || null },
        });
        await this.events.publish("TravelReviewCreated" as never, { reviewId: created.id, listingId: row.listingId, organizationId: row.listing.organizationId }, { tx, aggregateType: "TravelListing", aggregateId: row.listingId });
        return created;
      });
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
      return {
        id: review.id,
        overall: review.overall,
        petFriendliness: review.petFriendliness,
        cleanliness: review.cleanliness,
        location: review.location,
        accuracy: review.accuracy,
        body: review.body,
        authorName: firstName(user?.displayName ?? null),
        stayMonth: toDateKey(row.checkIn).slice(0, 7),
        providerResponse: null,
        createdAt: review.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new TravelActionNotAllowedException("TRAVEL_REVIEW_NOT_ALLOWED", "This stay has already been reviewed.", { bookingId });
      throw error;
    }
  }

  async listPublishedReviews(listingId: string, page = 1, pageSize = 10): Promise<PaginatedDto<TravelReviewDto>> {
    const size = Math.min(Math.max(pageSize, 1), 30);
    const where = { listingId, status: TravelReviewStatus.PUBLISHED };
    const [rows, total] = await Promise.all([
      this.prisma.travelReview.findMany({ where, include: { booking: { select: { checkIn: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (Math.max(page, 1) - 1) * size, take: size }),
      this.prisma.travelReview.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } });
    const nameById = new Map(users.map((u) => [u.id, firstName(u.displayName)]));
    return toPaginatedDto(
      rows.map((r) => ({
        id: r.id,
        overall: r.overall,
        petFriendliness: r.petFriendliness,
        cleanliness: r.cleanliness,
        location: r.location,
        accuracy: r.accuracy,
        body: r.body,
        authorName: nameById.get(r.userId) ?? "—",
        stayMonth: toDateKey(r.booking.checkIn).slice(0, 7),
        providerResponse: r.providerResponse,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      Math.max(page, 1),
      size,
    );
  }

  // --- Documents (minimum-data sharing) ------------------------------------------------

  /**
   * The traveller explicitly shares ONE document of a pet on this booking with
   * the accommodation, for a stated purpose, until the day after check-out.
   * Nothing else about the pet's health is ever exposed to a travel provider.
   */
  async shareDocument(userId: string, bookingId: string, input: { medicalDocumentId: string; purpose: string }): Promise<TravelBookingDto> {
    const row = await this.loadForTraveler(userId, bookingId);
    const live: TravelBookingStatus[] = [TravelBookingStatus.AWAITING_PROVIDER, TravelBookingStatus.AWAITING_PAYMENT, TravelBookingStatus.CONFIRMED, TravelBookingStatus.IN_PROGRESS];
    if (!live.includes(row.status)) throw new TravelActionNotAllowedException("TRAVEL_DOCUMENT_SHARE_NOT_ALLOWED", "Documents can only be shared on an active booking.", { bookingId });
    const doc = await this.prisma.medicalDocument.findUnique({ where: { id: input.medicalDocumentId }, select: { petId: true, householdId: true, voidedAt: true } });
    const bookingPetIds = new Set(row.pets.map((p) => p.petId));
    if (!doc || doc.voidedAt || doc.householdId !== row.householdId || !bookingPetIds.has(doc.petId)) throw new NotFoundApiException("Document");
    const expiresAt = new Date(row.checkOut.getTime() + 86_400_000);
    await this.prisma.travelBookingDocumentShare.upsert({
      where: { bookingId_medicalDocumentId: { bookingId, medicalDocumentId: input.medicalDocumentId } },
      create: { bookingId, medicalDocumentId: input.medicalDocumentId, sharedByUserId: userId, purpose: input.purpose, expiresAt },
      update: { revokedAt: null, purpose: input.purpose, expiresAt },
    });
    await this.prisma.travelBookingEvent.create({ data: { bookingId, fromStatus: row.status, toStatus: row.status, actorType: "TRAVELER", actorId: userId, reason: "DOCUMENT_SHARED" } });
    return this.toDto(await this.loadForTraveler(userId, bookingId));
  }

  async revokeDocument(userId: string, bookingId: string, shareId: string): Promise<TravelBookingDto> {
    await this.loadForTraveler(userId, bookingId);
    const res = await this.prisma.travelBookingDocumentShare.updateMany({ where: { id: shareId, bookingId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count === 0) throw new NotFoundApiException("Document share");
    return this.toDto(await this.loadForTraveler(userId, bookingId));
  }

  /** Provider read: a short-lived signed URL, only while the share is live and only for this organisation's booking. */
  async providerDocumentUrl(organizationId: string, bookingId: string, shareId: string): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    await this.loadForOrganization(organizationId, bookingId);
    const share = await this.prisma.travelBookingDocumentShare.findFirst({ where: { id: shareId, bookingId }, include: { medicalDocument: { select: { fileObjectKey: true, voidedAt: true } } } });
    if (!share || share.revokedAt || share.expiresAt <= new Date() || share.medicalDocument.voidedAt) throw new NotFoundApiException("Document share");
    return this.storage.createPrivateDownloadTarget(share.medicalDocument.fileObjectKey);
  }
}

function firstName(displayName: string | null): string {
  return (displayName ?? "").trim().split(/\s+/)[0] || "—";
}

function snapshotPlan(plan: RatePlanTerms) {
  return {
    id: plan.id,
    name: plan.name,
    priceModifierPercent: plan.priceModifierPercent,
    cancellationType: plan.cancellationType,
    freeCancellationDays: plan.freeCancellationDays,
    lateRefundPercent: plan.lateRefundPercent,
    paymentTiming: plan.paymentTiming,
    depositPercent: plan.depositPercent,
    includesBreakfast: plan.includesBreakfast,
    includedItems: plan.includedItems,
    minNights: plan.minNights,
  };
}

function snapshotPolicy(p: {
  dogsAllowed: boolean;
  catsAllowed: boolean;
  otherAllowed: boolean;
  maxPets: number | null;
  maxWeightKg: number | null;
  minWeightKg: number | null;
  breedRestrictions: string[];
  vaccinationRequired: boolean;
  healthCertificateRequired: boolean;
  carrierRequired: boolean;
  leashRequired: boolean;
  petFeeIrr: number | null;
  depositIrr: number | null;
  restrictedAreas: string | null;
  notes: string | null;
}) {
  return {
    dogsAllowed: p.dogsAllowed,
    catsAllowed: p.catsAllowed,
    otherAllowed: p.otherAllowed,
    maxPets: p.maxPets,
    maxWeightKg: p.maxWeightKg,
    minWeightKg: p.minWeightKg,
    breedRestrictions: p.breedRestrictions,
    vaccinationRequired: p.vaccinationRequired,
    healthCertificateRequired: p.healthCertificateRequired,
    carrierRequired: p.carrierRequired,
    leashRequired: p.leashRequired,
    petFeeIrr: p.petFeeIrr,
    depositIrr: p.depositIrr,
    restrictedAreas: p.restrictedAreas,
    notes: p.notes,
  };
}
