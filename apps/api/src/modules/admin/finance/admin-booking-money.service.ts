import { Injectable } from "@nestjs/common";
import { BookingActorType, BookingStatus, PaymentStatus } from "@prisma/client";
import type { AdminBookingMoneyDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminAccessDeniedException, BookingNotCancellableException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { BOOKING_TRANSITIONS, BookingLifecycleService, bookingEventFields } from "../../booking/booking-lifecycle.service";
import { TravelBookingService } from "../../travel-marketplace/travel-booking.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { adminCan } from "../auth/admin-permissions";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminRefundService } from "./admin-refund.service";

export type StaffRefundChoice = "POLICY" | "FULL" | "AMOUNT" | "NONE";

/** Service bookings staff may still cancel (anything not already over). */
const STAFF_CANCELLABLE: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.REQUESTED, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
const STAY_CANCELLABLE = ["HELD", "AWAITING_PROVIDER", "AWAITING_PAYMENT", "CONFIRMED", "IN_PROGRESS"];

/**
 * Staff cancel and refund for service bookings and travel stays. Cancelling uses each domain's own lifecycle (so
 * capacity/nights are released and both sides are told); money never moves here — it goes back only through a
 * finance AdminRefundApproval (two-person control above the threshold, executed against the payment itself).
 */
@Injectable()
export class AdminBookingMoneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly lifecycle: BookingLifecycleService,
    private readonly stays: TravelBookingService,
    private readonly refunds: AdminRefundService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private requireRefundPermission(admin: ResolvedAdminContext) {
    if (!adminCan(admin, "finance.refund.request")) throw new AdminAccessDeniedException({ reason: "INSUFFICIENT_PERMISSION", requiredPermissions: ["finance.refund.request"], role: admin.role });
  }

  private pickAmount(choice: StaffRefundChoice, amount: number | undefined, policy: number, refundable: number): number {
    const value = choice === "NONE" ? 0 : choice === "FULL" ? refundable : choice === "POLICY" ? Math.min(policy, refundable) : (amount ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > refundable) throw new ValidationApiException({ field: "amount", reason: "EXCEEDS_REFUNDABLE", refundableIrr: refundable });
    if (choice === "AMOUNT" && value <= 0) throw new ValidationApiException({ field: "amount", reason: "AMOUNT_REQUIRED" });
    return value;
  }

  // --- Service bookings -------------------------------------------------------------------------

  async serviceBookingMoney(id: string): Promise<AdminBookingMoneyDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundApiException("Booking");
    const money = await this.refunds.bookingMoney("BOOKING", id);
    return {
      kind: "BOOKING",
      bookingId: id,
      reference: booking.bookingNumber,
      status: booking.bookingStatus,
      paymentStatus: booking.paymentStatus,
      paidIrr: money.paidIrr,
      refundedIrr: money.refundedIrr,
      refundableIrr: money.refundableIrr,
      policyRefundIrr: Math.min(money.refundableIrr, this.lifecycle.decideRefund(booking, money.paidIrr, false).amount),
      cancellable: STAFF_CANCELLABLE.includes(booking.bookingStatus),
      approvals: await this.refunds.listForBooking("BOOKING", id),
    };
  }

  async cancelServiceBooking(admin: ResolvedAdminContext, id: string, input: { reason: string; refund: StaffRefundChoice; amount?: number }, requestId?: string): Promise<AdminBookingMoneyDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundApiException("Booking");
    if (!STAFF_CANCELLABLE.includes(booking.bookingStatus)) throw new BookingNotCancellableException({ bookingId: id, status: booking.bookingStatus });
    if (input.refund !== "NONE") this.requireRefundPermission(admin);
    const money = await this.refunds.bookingMoney("BOOKING", id);
    const amount = this.pickAmount(input.refund, input.amount, this.lifecycle.decideRefund(booking, money.paidIrr, false).amount, money.refundableIrr);
    // Staff act for the platform: "cancelled by provider" where the state machine allows it, otherwise the member's
    // cancellation state; the timeline records the ADMIN actor and the reason either way.
    const to = BOOKING_TRANSITIONS[booking.bookingStatus]?.includes(BookingStatus.CANCELLED_BY_PROVIDER) ? BookingStatus.CANCELLED_BY_PROVIDER : BookingStatus.CANCELLED_BY_USER;
    await this.prisma.$transaction(async (tx) => {
      const cancelled = await this.lifecycle.transition(tx, {
        bookingId: id,
        to,
        actorType: BookingActorType.ADMIN,
        actorId: admin.userId,
        reason: input.reason,
        data: { cancelledAt: new Date(), cancelledReason: input.reason, cancellationReasonCode: "SYSTEM_STAFF_CANCELLED", ...(amount > 0 && booking.paymentStatus === PaymentStatus.PAID ? { paymentStatus: PaymentStatus.REFUND_PENDING } : {}) },
      });
      await this.events.publish("ServiceBookingCancelled", { ...bookingEventFields(cancelled), reason: input.reason, cancelledBy: "ADMIN" }, { tx, aggregateType: "Booking", aggregateId: id });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "service_booking.staff_cancelled", entityType: "Booking", entityId: id, reason: input.reason, beforeSummary: { status: booking.bookingStatus }, afterSummary: { status: to, refund: input.refund, amount }, requestId, tx });
    });
    if (amount > 0) await this.refunds.requestForBooking(admin, { type: "BOOKING", id }, amount, `Staff cancellation: ${input.reason}`, undefined, requestId);
    return this.serviceBookingMoney(id);
  }

  async refundServiceBooking(admin: ResolvedAdminContext, id: string, input: { amount: number; reason: string }, requestId?: string): Promise<AdminBookingMoneyDto> {
    this.requireRefundPermission(admin);
    await this.refunds.requestForBooking(admin, { type: "BOOKING", id }, input.amount, input.reason, undefined, requestId);
    return this.serviceBookingMoney(id);
  }

  // --- Travel stays -----------------------------------------------------------------------------

  async stayMoney(id: string): Promise<AdminBookingMoneyDto> {
    const stay = await this.stays.loadForStaff(id);
    const money = await this.refunds.bookingMoney("TRAVEL_BOOKING", id);
    return {
      kind: "TRAVEL_BOOKING",
      bookingId: id,
      reference: stay.reference,
      status: stay.status,
      paymentStatus: stay.paymentStatus,
      paidIrr: money.paidIrr,
      refundedIrr: money.refundedIrr,
      refundableIrr: money.refundableIrr,
      policyRefundIrr: Math.min(money.refundableIrr, this.stays.policyRefundIrr(stay, money.paidIrr)),
      cancellable: STAY_CANCELLABLE.includes(stay.status),
      approvals: await this.refunds.listForBooking("TRAVEL_BOOKING", id),
    };
  }

  async cancelStay(admin: ResolvedAdminContext, id: string, input: { reason: string; refund: StaffRefundChoice; amount?: number }, requestId?: string): Promise<AdminBookingMoneyDto> {
    const stay = await this.stays.loadForStaff(id);
    if (!STAY_CANCELLABLE.includes(stay.status)) throw new ValidationApiException({ field: "status", reason: "NOT_CANCELLABLE", status: stay.status });
    if (input.refund !== "NONE") this.requireRefundPermission(admin);
    const money = await this.refunds.bookingMoney("TRAVEL_BOOKING", id);
    const amount = this.pickAmount(input.refund, input.amount, this.stays.policyRefundIrr(stay, money.paidIrr), money.refundableIrr);
    await this.stays.cancelAsStaff(admin.userId, id, input.reason);
    if (amount > 0 && stay.paymentStatus === "PAID") await this.prisma.travelBooking.update({ where: { id }, data: { paymentStatus: "REFUND_PENDING" } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "travel_booking.staff_cancelled", entityType: "TravelBooking", entityId: id, reason: input.reason, beforeSummary: { status: stay.status }, afterSummary: { status: "CANCELLED", refund: input.refund, amount }, requestId });
    if (amount > 0) await this.refunds.requestForBooking(admin, { type: "TRAVEL_BOOKING", id }, amount, `Staff cancellation: ${input.reason}`, undefined, requestId);
    return this.stayMoney(id);
  }

  async refundStay(admin: ResolvedAdminContext, id: string, input: { amount: number; reason: string }, requestId?: string): Promise<AdminBookingMoneyDto> {
    this.requireRefundPermission(admin);
    await this.stays.loadForStaff(id);
    await this.refunds.requestForBooking(admin, { type: "TRAVEL_BOOKING", id }, input.amount, input.reason, undefined, requestId);
    return this.stayMoney(id);
  }
}
