import { ValidationApiException } from "../../../common/errors/api-exception";
import { PlatformSettingsService } from "../../platform-settings/platform-settings.service";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminRefundApprovalStatus, AdminRefundSubjectType, BookingActorType, PaymentIntentStatus, PaymentStatus, Prisma, RefundStatus } from "@prisma/client";
import type { AdminRefundApprovalDto } from "@petlife/types";
import type { AppEnv } from "../../../config/env";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  AdminRefundApprovalNotFoundException,
  AdminRefundApprovalRequiredException,
  AdminRefundSelfApprovalException,
  InvalidAdminRefundApprovalTransitionException,
  OrderNotFoundException,
} from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { RefundsService } from "../../commerce/refunds/refunds.service";

export const APPROVAL_INCLUDE = { requestedByAdmin: { include: { user: true } }, approvedByAdmin: { include: { user: true } } } as const;
export type ApprovalWithRelations = Prisma.AdminRefundApprovalGetPayload<{ include: typeof APPROVAL_INCLUDE }>;

export function toRefundApprovalDto(row: ApprovalWithRelations): AdminRefundApprovalDto {
  return {
    id: row.id,
    subjectType: row.subjectType as AdminRefundApprovalDto["subjectType"],
    orderId: row.orderId,
    bookingId: row.bookingId,
    travelBookingId: row.travelBookingId,
    amount: row.amount,
    reason: row.reason,
    status: row.status as never,
    requestedByAdmin: { id: row.requestedByAdmin.id, displayName: row.requestedByAdmin.user.displayName, role: row.requestedByAdmin.role as never },
    approvedByAdmin: row.approvedByAdmin ? { id: row.approvedByAdmin.id, displayName: row.approvedByAdmin.user.displayName, role: row.approvedByAdmin.role as never } : null,
    refundId: row.refundId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    executedAt: row.executedAt ? row.executedAt.toISOString() : null,
  };
}

/**
 * Two-person control for refunds (spec: "refund above threshold ->
 * REQUESTED -> APPROVED -> EXECUTED"). `execute()` is the *only* method
 * that ever calls RefundsService.request() — this class never touches
 * PaymentIntent/Refund/LedgerEntry rows directly, wrapping (never
 * replacing) the existing H07 refund flow, called with the order's own
 * true `userId` so RefundsService's own ownership check
 * (`order.userId !== userId`) is satisfied trivially, requiring zero
 * changes to H07 code (see the AdminRefundApproval model's own doc
 * comment).
 */
@Injectable()
export class AdminRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly refunds: RefundsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  private threshold(): number {
    return this.settings.getInt("commerce.refundApprovalThresholdIrr");
  }

  async request(admin: ResolvedAdminContext, orderId: string, amount: number, reason: string, idempotencyKey?: string, requestId?: string): Promise<AdminRefundApprovalDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundException({ orderId });
    // Early, honest feedback: execution re-checks against the captured amount (RefundsService), but a request for more
    // than the order total can never succeed, so it isn't accepted into the approval queue.
    if (!Number.isInteger(amount) || amount <= 0 || amount > order.totalAmount) throw new ValidationApiException({ field: "amount", reason: "EXCEEDS_ORDER_TOTAL", orderTotal: order.totalAmount });

    let row: ApprovalWithRelations;
    if (idempotencyKey) {
      try {
        row = await this.prisma.adminRefundApproval.create({
          data: { orderId, amount, reason, idempotencyKey, requestedByAdminId: admin.adminUserId },
          include: APPROVAL_INCLUDE,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        // A double-click retry with the same key replays the original request rather than creating a second approval row.
        row = await this.prisma.adminRefundApproval.findUniqueOrThrow({ where: { idempotencyKey }, include: APPROVAL_INCLUDE });
        return toRefundApprovalDto(row);
      }
    } else {
      row = await this.prisma.adminRefundApproval.create({
        data: { orderId, amount, reason, requestedByAdminId: admin.adminUserId },
        include: APPROVAL_INCLUDE,
      });
    }

    await this.events.publish("AdminRefundApprovalRequested", { approvalId: row.id, orderId, amount }, { aggregateType: "AdminRefundApproval", aggregateId: row.id });
    await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_refund_approval.requested", entityType: "ADMIN_REFUND_APPROVAL", entityId: row.id, reason, afterSummary: { orderId, amount }, requestId });
    return toRefundApprovalDto(row);
  }

  async approve(admin: ResolvedAdminContext, approvalId: string, requestId?: string): Promise<AdminRefundApprovalDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "admin_refund_approvals" WHERE "id" = ${approvalId}::uuid FOR UPDATE`;
      if (!locked) throw new AdminRefundApprovalNotFoundException({ approvalId });

      const existing = await tx.adminRefundApproval.findUniqueOrThrow({ where: { id: approvalId } });
      if (existing.status !== AdminRefundApprovalStatus.REQUESTED) {
        throw new InvalidAdminRefundApprovalTransitionException({ approvalId, from: existing.status, to: AdminRefundApprovalStatus.APPROVED });
      }
      // Two-person control (spec: "a *different* admin than the requester
      // must APPROVE") — never bypassable, mirrored by the DB-level CHECK
      // constraint added in this same handoff's migration.
      if (existing.requestedByAdminId === admin.adminUserId) throw new AdminRefundSelfApprovalException({ approvalId });

      const row = await tx.adminRefundApproval.update({ where: { id: approvalId }, data: { status: AdminRefundApprovalStatus.APPROVED, approvedByAdminId: admin.adminUserId }, include: APPROVAL_INCLUDE });
      await this.events.publish("AdminRefundApprovalApproved", { approvalId }, { tx, aggregateType: "AdminRefundApproval", aggregateId: approvalId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_refund_approval.approved", entityType: "ADMIN_REFUND_APPROVAL", entityId: approvalId, requestId, tx });
      return row;
    });
    return toRefundApprovalDto(updated);
  }

  async reject(admin: ResolvedAdminContext, approvalId: string, reason: string | undefined, requestId?: string): Promise<AdminRefundApprovalDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "admin_refund_approvals" WHERE "id" = ${approvalId}::uuid FOR UPDATE`;
      if (!locked) throw new AdminRefundApprovalNotFoundException({ approvalId });

      const existing = await tx.adminRefundApproval.findUniqueOrThrow({ where: { id: approvalId } });
      if (existing.status !== AdminRefundApprovalStatus.REQUESTED && existing.status !== AdminRefundApprovalStatus.APPROVED) {
        throw new InvalidAdminRefundApprovalTransitionException({ approvalId, from: existing.status, to: AdminRefundApprovalStatus.REJECTED });
      }

      const row = await tx.adminRefundApproval.update({ where: { id: approvalId }, data: { status: AdminRefundApprovalStatus.REJECTED }, include: APPROVAL_INCLUDE });
      await this.events.publish("AdminRefundApprovalRejected", { approvalId }, { tx, aggregateType: "AdminRefundApproval", aggregateId: approvalId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_refund_approval.rejected", entityType: "ADMIN_REFUND_APPROVAL", entityId: approvalId, reason, requestId, tx });
      return row;
    });
    return toRefundApprovalDto(updated);
  }

  /**
   * The only method that ever calls RefundsService.request(). Locks the
   * approval row first so a double-click (or two admins racing to execute
   * the same approval) can never call RefundsService.request() twice for
   * one AdminRefundApproval — the second caller sees the already-EXECUTED
   * status once it acquires the lock and is rejected as an invalid
   * transition, never a second refund.
   */
  async execute(admin: ResolvedAdminContext, approvalId: string, requestId?: string): Promise<AdminRefundApprovalDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "admin_refund_approvals" WHERE "id" = ${approvalId}::uuid FOR UPDATE`;
      if (!locked) throw new AdminRefundApprovalNotFoundException({ approvalId });

      const existing = await tx.adminRefundApproval.findUniqueOrThrow({ where: { id: approvalId } });
      if (existing.status === AdminRefundApprovalStatus.EXECUTED) {
        return tx.adminRefundApproval.findUniqueOrThrow({ where: { id: approvalId }, include: APPROVAL_INCLUDE });
      }
      if (existing.amount >= this.threshold() && existing.status !== AdminRefundApprovalStatus.APPROVED) {
        throw new AdminRefundApprovalRequiredException({ approvalId, threshold: this.threshold() });
      }
      if (existing.status !== AdminRefundApprovalStatus.REQUESTED && existing.status !== AdminRefundApprovalStatus.APPROVED) {
        throw new InvalidAdminRefundApprovalTransitionException({ approvalId, from: existing.status, to: AdminRefundApprovalStatus.EXECUTED });
      }

      let refund: { id: string };
      if (existing.subjectType === AdminRefundSubjectType.ORDER) {
        const orderId = existing.orderId!;
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order || !order.userId) throw new OrderNotFoundException({ orderId });
        refund = await this.refunds.request(order.userId, orderId, existing.reason, existing.amount);
      } else {
        refund = await this.executeBookingRefund(admin, existing);
      }

      const row = await tx.adminRefundApproval.update({
        where: { id: approvalId },
        data: { status: AdminRefundApprovalStatus.EXECUTED, refundId: refund.id, executedAt: new Date() },
        include: APPROVAL_INCLUDE,
      });
      await this.events.publish("AdminRefundApprovalExecuted", { approvalId, refundId: refund.id }, { tx, aggregateType: "AdminRefundApproval", aggregateId: approvalId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_refund_approval.executed", entityType: "ADMIN_REFUND_APPROVAL", entityId: approvalId, afterSummary: { refundId: refund.id }, requestId, tx });
      return row;
    });
    return toRefundApprovalDto(updated);
  }

  /**
   * Opens an approval for a service booking or a travel stay. The amount must fit what was captured online minus what
   * has already gone back; execution re-checks it against the payment itself (RefundsService).
   */
  async requestForBooking(admin: ResolvedAdminContext, subject: { type: "BOOKING" | "TRAVEL_BOOKING"; id: string }, amount: number, reason: string, idempotencyKey?: string, requestId?: string): Promise<AdminRefundApprovalDto> {
    const money = await this.bookingMoney(subject.type, subject.id);
    if (!Number.isInteger(amount) || amount <= 0 || amount > money.refundableIrr) throw new ValidationApiException({ field: "amount", reason: "EXCEEDS_REFUNDABLE", refundableIrr: money.refundableIrr });
    const subjectData = subject.type === "BOOKING" ? { subjectType: AdminRefundSubjectType.BOOKING, bookingId: subject.id } : { subjectType: AdminRefundSubjectType.TRAVEL_BOOKING, travelBookingId: subject.id };
    if (idempotencyKey) {
      const prior = await this.prisma.adminRefundApproval.findUnique({ where: { idempotencyKey }, include: APPROVAL_INCLUDE });
      if (prior) return toRefundApprovalDto(prior);
    }
    const row = await this.prisma.adminRefundApproval.create({ data: { ...subjectData, amount, reason, idempotencyKey: idempotencyKey ?? null, requestedByAdminId: admin.adminUserId }, include: APPROVAL_INCLUDE });
    await this.events.publish("AdminRefundApprovalRequested", { approvalId: row.id, subjectType: subject.type, subjectId: subject.id, amount }, { aggregateType: "AdminRefundApproval", aggregateId: row.id });
    await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_refund_approval.requested", entityType: "ADMIN_REFUND_APPROVAL", entityId: row.id, reason, afterSummary: { subjectType: subject.type, subjectId: subject.id, amount }, requestId });
    return toRefundApprovalDto(row);
  }

  /** Captured online, refunded so far, and what is left, for a service booking or a stay (rials). */
  async bookingMoney(type: "BOOKING" | "TRAVEL_BOOKING", id: string): Promise<{ paymentIntentId: string | null; checkoutId: string | null; paidIrr: number; refundedIrr: number; refundableIrr: number }> {
    const row = type === "BOOKING"
      ? await this.prisma.booking.findUnique({ where: { id }, select: { paymentIntentId: true } })
      : await this.prisma.travelBooking.findUnique({ where: { id }, select: { paymentIntentId: true } });
    if (!row) throw new ValidationApiException({ field: "booking", reason: "NOT_FOUND" });
    const intent = row.paymentIntentId ? await this.prisma.paymentIntent.findUnique({ where: { id: row.paymentIntentId } }) : null;
    if (!intent || intent.status !== PaymentIntentStatus.CAPTURED) return { paymentIntentId: intent?.id ?? null, checkoutId: intent?.checkoutId ?? null, paidIrr: 0, refundedIrr: 0, refundableIrr: 0 };
    // Member-cancellation placeholders (REQUESTED with no admin) are not money that left; finance decides them here.
    const refunds = await this.prisma.refund.findMany({ where: { paymentIntentId: intent.id, status: { in: [RefundStatus.SUCCEEDED, RefundStatus.PROCESSING] } }, select: { amount: true } });
    const refundedIrr = refunds.reduce((sum, r) => sum + r.amount, 0);
    return { paymentIntentId: intent.id, checkoutId: intent.checkoutId, paidIrr: intent.amount, refundedIrr, refundableIrr: Math.max(0, intent.amount - refundedIrr) };
  }

  /**
   * Refunds a booking/stay payment through the gateway (RefundsService.refundStandalonePayment) and records it on the
   * booking in the same transaction that marks the refund SUCCEEDED. A member's earlier refund request for the same
   * payment (left REQUESTED by a cancellation) is superseded first, so the money can only go back once.
   */
  private async executeBookingRefund(admin: ResolvedAdminContext, approval: { id: string; subjectType: AdminRefundSubjectType; bookingId: string | null; travelBookingId: string | null; amount: number; reason: string }): Promise<{ id: string }> {
    const type = approval.subjectType === AdminRefundSubjectType.BOOKING ? "BOOKING" : "TRAVEL_BOOKING";
    const subjectId = (type === "BOOKING" ? approval.bookingId : approval.travelBookingId)!;
    const money = await this.bookingMoney(type, subjectId);
    if (!money.checkoutId || !money.paymentIntentId || money.paidIrr <= 0) throw new ValidationApiException({ field: "payment", reason: "NO_CAPTURED_ONLINE_PAYMENT" });
    if (approval.amount > money.refundableIrr) throw new ValidationApiException({ field: "amount", reason: "EXCEEDS_REFUNDABLE", refundableIrr: money.refundableIrr });
    await this.prisma.refund.updateMany({
      where: { paymentIntentId: money.paymentIntentId, status: RefundStatus.REQUESTED, orderId: null, requestedByAdminUserId: null },
      data: { status: RefundStatus.CANCELLED, reason: `SUPERSEDED_BY_ADMIN_APPROVAL:${approval.id}` },
    });
    const paidIrr = money.paidIrr;
    const refundedAfter = money.refundedIrr + approval.amount;
    return this.refunds.refundStandalonePayment(money.checkoutId, approval.amount, "IRR", approval.reason, null, {
      actorType: "ADMIN",
      actorId: admin.userId,
      requestedByAdminUserId: admin.adminUserId,
      allowAdditionalRefund: true,
      onSucceeded: async (tx) => {
        const note = `REFUNDED:${approval.amount}:APPROVAL:${approval.id}`;
        if (type === "BOOKING") {
          const booking = await tx.booking.findUniqueOrThrow({ where: { id: subjectId } });
          await tx.booking.update({ where: { id: subjectId }, data: { paymentStatus: refundedAfter >= paidIrr ? PaymentStatus.REFUNDED : PaymentStatus.PAID } });
          await tx.bookingStatusEvent.create({ data: { bookingId: subjectId, fromStatus: booking.bookingStatus, toStatus: booking.bookingStatus, actorType: BookingActorType.ADMIN, actorId: admin.userId, reason: note } });
        } else {
          const stay = await tx.travelBooking.findUniqueOrThrow({ where: { id: subjectId } });
          await tx.travelBooking.update({ where: { id: subjectId }, data: { refundAmountIrr: refundedAfter, paymentStatus: refundedAfter >= paidIrr ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
          await tx.travelBookingEvent.create({ data: { bookingId: subjectId, fromStatus: stay.status, toStatus: stay.status, actorType: "ADMIN", actorId: admin.userId, reason: note } });
        }
      },
    });
  }

  /** Approvals for one booking/stay, newest first. */
  async listForBooking(type: "BOOKING" | "TRAVEL_BOOKING", id: string): Promise<AdminRefundApprovalDto[]> {
    const rows = await this.prisma.adminRefundApproval.findMany({ where: type === "BOOKING" ? { bookingId: id } : { travelBookingId: id }, orderBy: { createdAt: "desc" }, include: APPROVAL_INCLUDE });
    return rows.map(toRefundApprovalDto);
  }

  /** The finance queue: open approvals first (REQUESTED, then APPROVED), then recent decided ones. */
  async list(input: { status?: AdminRefundApprovalStatus; page?: number; pageSize?: number }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
    const where: Prisma.AdminRefundApprovalWhereInput = input.status ? { status: input.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.adminRefundApproval.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: APPROVAL_INCLUDE }),
      this.prisma.adminRefundApproval.count({ where }),
    ]);
    return { items: rows.map(toRefundApprovalDto), total, page, pageSize };
  }

  async get(approvalId: string): Promise<AdminRefundApprovalDto> {
    const row = await this.prisma.adminRefundApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDE });
    if (!row) throw new AdminRefundApprovalNotFoundException({ approvalId });
    return toRefundApprovalDto(row);
  }
}
