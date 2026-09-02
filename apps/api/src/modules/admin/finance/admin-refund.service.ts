import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminRefundApprovalStatus, Prisma } from "@prisma/client";
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

const APPROVAL_INCLUDE = { requestedByAdmin: { include: { user: true } }, approvedByAdmin: { include: { user: true } } } as const;
type ApprovalWithRelations = Prisma.AdminRefundApprovalGetPayload<{ include: typeof APPROVAL_INCLUDE }>;

function toDto(row: ApprovalWithRelations): AdminRefundApprovalDto {
  return {
    id: row.id,
    orderId: row.orderId,
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
  ) {}

  private threshold(): number {
    return this.config.get("ADMIN_REFUND_APPROVAL_THRESHOLD_IRR", { infer: true });
  }

  async request(admin: ResolvedAdminContext, orderId: string, amount: number, reason: string, idempotencyKey?: string, requestId?: string): Promise<AdminRefundApprovalDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundException({ orderId });

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
        return toDto(row);
      }
    } else {
      row = await this.prisma.adminRefundApproval.create({
        data: { orderId, amount, reason, requestedByAdminId: admin.adminUserId },
        include: APPROVAL_INCLUDE,
      });
    }

    await this.events.publish("AdminRefundApprovalRequested", { approvalId: row.id, orderId, amount }, { aggregateType: "AdminRefundApproval", aggregateId: row.id });
    await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_refund_approval.requested", entityType: "ADMIN_REFUND_APPROVAL", entityId: row.id, reason, afterSummary: { orderId, amount }, requestId });
    return toDto(row);
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
    return toDto(updated);
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
    return toDto(updated);
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

      const order = await tx.order.findUnique({ where: { id: existing.orderId } });
      if (!order || !order.userId) throw new OrderNotFoundException({ orderId: existing.orderId });

      const refund = await this.refunds.request(order.userId, existing.orderId, existing.reason, existing.amount);

      const row = await tx.adminRefundApproval.update({
        where: { id: approvalId },
        data: { status: AdminRefundApprovalStatus.EXECUTED, refundId: refund.id, executedAt: new Date() },
        include: APPROVAL_INCLUDE,
      });
      await this.events.publish("AdminRefundApprovalExecuted", { approvalId, refundId: refund.id }, { tx, aggregateType: "AdminRefundApproval", aggregateId: approvalId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_refund_approval.executed", entityType: "ADMIN_REFUND_APPROVAL", entityId: approvalId, afterSummary: { refundId: refund.id }, requestId, tx });
      return row;
    });
    return toDto(updated);
  }

  async get(approvalId: string): Promise<AdminRefundApprovalDto> {
    const row = await this.prisma.adminRefundApproval.findUnique({ where: { id: approvalId }, include: APPROVAL_INCLUDE });
    if (!row) throw new AdminRefundApprovalNotFoundException({ approvalId });
    return toDto(row);
  }
}
