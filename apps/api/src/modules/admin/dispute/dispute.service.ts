import { Injectable } from "@nestjs/common";
import { DisputeStatus, Prisma } from "@prisma/client";
import type { DisputeDto, DisputeEvidenceDto, PaginatedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { DisputeNotFoundException, InvalidDisputeTransitionException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { DISPUTE_TRANSITIONS, RESOLVED_DISPUTE_STATUSES } from "./dispute-transitions";
import { toDisputeDto, toDisputeEvidenceDto } from "./dispute.mapper";
import type { AddDisputeEvidenceDto, CreateDisputeDto } from "./dto/dispute.dto";

const DISPUTE_INCLUDE = { assignedAdmin: { include: { user: true } }, evidence: { include: { actorUser: true, actorAdmin: { include: { user: true } } } } } as const;

export interface ListDisputesFilter {
  status?: DisputeStatus;
  assignedAdminId?: string;
}

/**
 * Owns the Dispute lifecycle (spec: "open -> evidence -> review ->
 * resolution... domain outcome and payment/refund state must remain
 * separate"). `transition()` never touches Refund/PaymentIntent/Order in
 * any way — a resolution in favor of the customer is only a status value
 * here; an admin separately opens a refund via AdminRefundService if one is
 * warranted (Handoff 11 stage 10). Concurrency safety mirrors
 * SupportCaseService.transition(): a `SELECT ... FOR UPDATE` row lock, then
 * validate against the row's committed status, so two admins racing to
 * resolve the same dispute can never both apply a transition — the second
 * is validated against whatever the first actually committed, never a
 * stale read (spec: "exactly one valid transition").
 */
@Injectable()
export class DisputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async create(admin: ResolvedAdminContext, dto: CreateDisputeDto, requestId?: string): Promise<DisputeDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dispute.create({
        data: {
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          raisedByUserId: dto.raisedByUserId,
          supportCaseId: dto.supportCaseId,
          claim: dto.claim,
        },
        include: DISPUTE_INCLUDE,
      });
      await this.events.publish("DisputeOpened", { disputeId: row.id, subjectType: row.subjectType, subjectId: row.subjectId }, { tx, aggregateType: "Dispute", aggregateId: row.id });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "dispute.opened", entityType: "DISPUTE", entityId: row.id, requestId, tx });
      return row;
    });
    return toDisputeDto(created);
  }

  async list(filter: ListDisputesFilter, query: PaginationQueryDto): Promise<PaginatedDto<DisputeDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.DisputeWhereInput = { status: filter.status, assignedAdminId: filter.assignedAdminId };
    const [rows, total] = await Promise.all([
      this.prisma.dispute.findMany({ where, include: DISPUTE_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.dispute.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toDisputeDto), total, page, pageSize);
  }

  async get(disputeId: string): Promise<DisputeDto> {
    const row = await this.prisma.dispute.findUnique({ where: { id: disputeId }, include: DISPUTE_INCLUDE });
    if (!row) throw new DisputeNotFoundException({ disputeId });
    return toDisputeDto(row);
  }

  async assign(admin: ResolvedAdminContext, disputeId: string, assigneeAdminId: string, requestId?: string): Promise<DisputeDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dispute.findUnique({ where: { id: disputeId } });
      if (!existing) throw new DisputeNotFoundException({ disputeId });
      const row = await tx.dispute.update({ where: { id: disputeId }, data: { assignedAdminId: assigneeAdminId }, include: DISPUTE_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "dispute.status_changed", entityType: "DISPUTE", entityId: disputeId, afterSummary: { assigneeAdminId }, requestId, tx });
      return row;
    });
    return toDisputeDto(updated);
  }

  async addEvidence(admin: ResolvedAdminContext, disputeId: string, dto: AddDisputeEvidenceDto, requestId?: string): Promise<DisputeEvidenceDto> {
    const evidence = await this.prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findUnique({ where: { id: disputeId } });
      if (!dispute) throw new DisputeNotFoundException({ disputeId });

      const created = await tx.disputeEvidence.create({
        data: {
          disputeId,
          actorType: dto.actorType,
          actorAdminId: admin.adminUserId,
          actorUserId: dto.actorUserId,
          statement: dto.statement,
          attachmentRef: dto.attachmentRef,
        },
        include: { actorUser: true, actorAdmin: { include: { user: true } } },
      });
      await this.events.publish("DisputeEvidenceAdded", { disputeId, evidenceId: created.id }, { tx, aggregateType: "Dispute", aggregateId: disputeId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "dispute.evidence_added", entityType: "DISPUTE", entityId: disputeId, requestId, tx });
      return created;
    });
    return toDisputeEvidenceDto(evidence);
  }

  async transition(admin: ResolvedAdminContext, disputeId: string, to: DisputeStatus, resolutionSummary: string | undefined, requestId?: string): Promise<DisputeDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "disputes" WHERE "id" = ${disputeId}::uuid FOR UPDATE`;
      if (!locked) throw new DisputeNotFoundException({ disputeId });

      const current = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } });
      if (current.status === to) return tx.dispute.findUniqueOrThrow({ where: { id: disputeId }, include: DISPUTE_INCLUDE });

      const allowed = DISPUTE_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(to)) {
        throw new InvalidDisputeTransitionException({ disputeId, from: current.status, to });
      }

      const data: Prisma.DisputeUpdateInput = { status: to };
      if (resolutionSummary) data.resolutionSummary = resolutionSummary;
      if (RESOLVED_DISPUTE_STATUSES.has(to) && !current.resolvedAt) data.resolvedAt = new Date();
      if (to === DisputeStatus.CLOSED && !current.closedAt) data.closedAt = new Date();

      const row = await tx.dispute.update({ where: { id: disputeId }, data, include: DISPUTE_INCLUDE });

      await this.events.publish("DisputeStatusChanged", { disputeId, from: current.status, to }, { tx, aggregateType: "Dispute", aggregateId: disputeId });
      if (RESOLVED_DISPUTE_STATUSES.has(to)) {
        await this.events.publish("DisputeResolved", { disputeId, status: to }, { tx, aggregateType: "Dispute", aggregateId: disputeId });
      }
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "dispute.status_changed",
        entityType: "DISPUTE",
        entityId: disputeId,
        beforeSummary: { status: current.status },
        afterSummary: { status: to },
        requestId,
        tx,
      });

      return row;
    });
    return toDisputeDto(updated);
  }
}
