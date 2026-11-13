import { Injectable } from "@nestjs/common";
import { AdminRefundApprovalStatus, DisputeStatus, DisputeSubjectType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminRefundService } from "../finance/admin-refund.service";
import { DISPUTE_LIFECYCLE } from "../support/support-ops.service";
import { DisputeService } from "./dispute.service";

/**
 * ERP-F: a dispute decided in the customer's favour with money back. The refund is never written here — it is opened
 * through AdminRefundService (threshold → second approver → execution via RefundsService); the dispute only records
 * the approval id and moves to RESOLVED_CUSTOMER. `lifecycle` reads REFUNDED once that approval is EXECUTED.
 */
@Injectable()
export class DisputeOutcomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disputes: DisputeService,
    private readonly refunds: AdminRefundService,
    private readonly audit: AdminAuditLogService,
  ) {}

  async outcome(disputeId: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!d) throw new NotFoundApiException("Dispute");
    const approval = d.refundApprovalId ? await this.prisma.adminRefundApproval.findUnique({ where: { id: d.refundApprovalId }, select: { id: true, status: true, amount: true, subjectType: true, orderId: true, bookingId: true, travelBookingId: true } }) : null;
    return { disputeId, status: d.status, lifecycle: DISPUTE_LIFECYCLE(d.status, approval?.status === AdminRefundApprovalStatus.EXECUTED), refundApproval: approval };
  }

  /** A BOOKING dispute names either a service booking or a travel stay. */
  private async bookingSubject(id: string): Promise<{ type: "BOOKING" | "TRAVEL_BOOKING"; id: string }> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundApiException("Booking");
    if (await this.prisma.booking.findUnique({ where: { id }, select: { id: true } })) return { type: "BOOKING", id };
    if (await this.prisma.travelBooking.findUnique({ where: { id }, select: { id: true } })) return { type: "TRAVEL_BOOKING", id };
    throw new NotFoundApiException("Booking");
  }

  async resolveWithRefund(admin: ResolvedAdminContext, disputeId: string, amount: number, reason: string, requestId?: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!d) throw new NotFoundApiException("Dispute");
    if (d.subjectType !== DisputeSubjectType.ORDER && d.subjectType !== DisputeSubjectType.BOOKING) throw new ValidationApiException({ field: "subjectType", reason: "REFUND_OUTCOME_ORDER_OR_BOOKING_ONLY", subjectType: d.subjectType });
    if (d.status !== DisputeStatus.UNDER_REVIEW && d.status !== DisputeStatus.AWAITING_EVIDENCE) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: d.status });
    if (d.refundApprovalId) throw new ValidationApiException({ field: "refundApprovalId", reason: "ALREADY_REQUESTED" });
    // Real finance workflow: validates the amount against what was captured and applies the approval threshold.
    const approval = d.subjectType === DisputeSubjectType.ORDER
      ? await this.refunds.request(admin, d.subjectId, amount, `Dispute ${disputeId}: ${reason}`, `dispute-refund:${disputeId}`, requestId)
      : await this.refunds.requestForBooking(admin, await this.bookingSubject(d.subjectId), amount, `Dispute ${disputeId}: ${reason}`, `dispute-refund:${disputeId}`, requestId);
    await this.prisma.dispute.update({ where: { id: disputeId }, data: { refundApprovalId: approval.id } });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "dispute.refund_outcome", entityType: "DISPUTE", entityId: disputeId, reason, afterSummary: { refundApprovalId: approval.id, amount } });
    await this.disputes.transition(admin, disputeId, DisputeStatus.RESOLVED_CUSTOMER, `Refund requested (${amount} IRR): ${reason}`, requestId);
    return this.outcome(disputeId);
  }
}
