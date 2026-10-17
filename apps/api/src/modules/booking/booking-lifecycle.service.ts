import { Injectable } from "@nestjs/common";
import { BookingActorType, BookingStatus, PaymentStatus, Prisma, RefundStatus, type Booking } from "@prisma/client";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { InvalidBookingTransitionException } from "../../common/errors/api-exception";
import { BookingPetAccessService } from "./booking-pet-access.service";
import { CareCalendarService } from "../care-calendar/care-calendar.service";

/**
 * The only legal booking status moves. Anything not listed is rejected — there is no
 * arbitrary status PATCH anywhere (consumer, provider or admin).
 */
export const BOOKING_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  [BookingStatus.HOLD]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED_BY_USER],
  [BookingStatus.PENDING_CONFIRMATION]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_PROVIDER],
  [BookingStatus.REQUESTED]: [BookingStatus.CONFIRMED, BookingStatus.AWAITING_PAYMENT, BookingStatus.REJECTED, BookingStatus.EXPIRED, BookingStatus.CANCELLED_BY_USER],
  [BookingStatus.AWAITING_PAYMENT]: [BookingStatus.CONFIRMED, BookingStatus.EXPIRED, BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_PROVIDER],
  [BookingStatus.CONFIRMED]: [BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW, BookingStatus.RESCHEDULED, BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_PROVIDER],
  [BookingStatus.CHECKED_IN]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED_BY_PROVIDER],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED],
};

/** Statuses that hold capacity (a staff member, a resource or a location slot). */
export const OCCUPYING_STATUSES: BookingStatus[] = [
  BookingStatus.HOLD,
  BookingStatus.PENDING_CONFIRMATION,
  BookingStatus.REQUESTED,
  BookingStatus.AWAITING_PAYMENT,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.IN_PROGRESS,
];

export const TERMINAL_RELEASE_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED_BY_USER,
  BookingStatus.CANCELLED_BY_PROVIDER,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.RESCHEDULED,
];

/**
 * Booking events are published inside the booking's own transaction, before commit, so listeners
 * cannot re-read the booking row. Every booking event therefore carries its own recipients.
 */
export function bookingEventFields(b: Pick<Booking, "id" | "userId" | "petId" | "householdId" | "providerOrganizationId" | "providerUserId" | "providerServiceId" | "category" | "startAt" | "endAt">) {
  return {
    bookingId: b.id,
    customerUserId: b.userId,
    petId: b.petId,
    householdId: b.householdId,
    providerOrganizationId: b.providerOrganizationId,
    providerUserId: b.providerUserId,
    serviceId: b.providerServiceId,
    category: b.category,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
  };
}

export interface TransitionInput {
  bookingId: string;
  to: BookingStatus;
  actorType: BookingActorType;
  actorId?: string | null;
  reason?: string | null;
  data?: Prisma.BookingUncheckedUpdateManyInput;
  /** Optional narrower set of allowed sources (still intersected with BOOKING_TRANSITIONS). */
  from?: BookingStatus[];
}

export interface RefundDecision {
  amount: number;
  paidAmount: number;
  withinFreeWindow: boolean;
  percent: number;
}

/**
 * Booking state machine + timeline. Every write is optimistic (`updateMany` on the expected source
 * status), so two racing actors can never both win — the loser gets INVALID_BOOKING_TRANSITION.
 */
@Injectable()
export class BookingLifecycleService {
  constructor(
    private readonly events: DomainEventsService,
    private readonly petAccess: BookingPetAccessService,
    private readonly careCalendar: CareCalendarService,
  ) {}

  async nextBookingNumber(tx: Prisma.TransactionClient): Promise<string> {
    const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('booking_number_seq') AS n`;
    return `PL-B-${String(row!.n).padStart(6, "0")}`;
  }

  async recordCreated(tx: Prisma.TransactionClient, booking: Booking, actorType: BookingActorType, actorId: string | null): Promise<void> {
    await tx.bookingStatusEvent.create({ data: { bookingId: booking.id, fromStatus: null, toStatus: booking.bookingStatus, actorType, actorId } });
  }

  async transition(tx: Prisma.TransactionClient, input: TransitionInput): Promise<Booking> {
    const current = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
    const allowedFrom = Object.entries(BOOKING_TRANSITIONS)
      .filter(([, targets]) => targets?.includes(input.to))
      .map(([from]) => from as BookingStatus)
      .filter((from) => !input.from || input.from.includes(from));
    if (!allowedFrom.includes(current.bookingStatus)) {
      throw new InvalidBookingTransitionException({ bookingId: input.bookingId, from: current.bookingStatus, to: input.to });
    }
    const updated = await tx.booking.updateMany({
      where: { id: input.bookingId, bookingStatus: current.bookingStatus },
      data: { ...input.data, bookingStatus: input.to },
    });
    if (updated.count !== 1) {
      throw new InvalidBookingTransitionException({ bookingId: input.bookingId, from: current.bookingStatus, to: input.to, reason: "concurrent change" });
    }
    await tx.bookingStatusEvent.create({
      data: { bookingId: input.bookingId, fromStatus: current.bookingStatus, toStatus: input.to, actorType: input.actorType, actorId: input.actorId ?? null, reason: input.reason ?? null },
    });
    const next = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
    if (TERMINAL_RELEASE_STATUSES.includes(input.to)) await this.releaseCapacity(tx, next, input.actorId ?? null);
    return next;
  }

  /**
   * Side effects of a booking leaving capacity: provider access ends, the calendar entry is marked
   * cancelled and waitlisted customers for that service are told capacity opened (never auto-booked).
   */
  private async releaseCapacity(tx: Prisma.TransactionClient, booking: Booking, actorId: string | null): Promise<void> {
    if (booking.bookingStatus !== BookingStatus.RESCHEDULED) {
      await this.petAccess.revokeForBooking(booking.id, actorId ?? booking.userId, tx);
    }
    await this.careCalendar.markCancelled(booking.id, tx);
    await this.events.publish(
      "BookingCapacityReleased",
      bookingEventFields(booking),
      { tx, aggregateType: "Booking", aggregateId: booking.id },
    );
  }

  /**
   * Refund due under the booking's own snapshotted terms: full refund inside the free-cancellation
   * window, otherwise the snapshotted late percentage. Provider cancellations always refund in full.
   */
  decideRefund(booking: Booking, paidAmount: number, byProvider: boolean, now = new Date()): RefundDecision {
    const hours = booking.freeCancellationHours ?? 24;
    const withinFreeWindow = byProvider || booking.startAt.getTime() - now.getTime() >= hours * 3600_000;
    const percent = withinFreeWindow ? 100 : (booking.lateCancellationRefundPercent ?? 0);
    return { amount: Math.floor((paidAmount * percent) / 100), paidAmount, withinFreeWindow, percent };
  }

  /** Records a refund request against the booking's own PaymentIntent. Execution/approval stays in the finance workflow. */
  async requestRefund(tx: Prisma.TransactionClient, booking: Booking, byProvider: boolean, requestedByUserId: string | null): Promise<RefundDecision | null> {
    if (!booking.paymentIntentId || booking.paymentStatus !== PaymentStatus.PAID) return null;
    const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: booking.paymentIntentId } });
    const decision = this.decideRefund(booking, intent.amount, byProvider);
    if (decision.amount <= 0) return decision;
    await tx.refund.create({
      data: {
        paymentIntentId: intent.id,
        amount: decision.amount,
        currency: intent.currency,
        status: RefundStatus.REQUESTED,
        reason: `BOOKING_CANCELLATION:${booking.bookingNumber ?? booking.id}:${decision.percent}%`,
        requestedByUserId,
      },
    });
    await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: PaymentStatus.REFUND_PENDING } });
    return decision;
  }
}
