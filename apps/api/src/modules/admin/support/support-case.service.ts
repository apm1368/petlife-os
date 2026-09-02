import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus, InternalNoteEntityType, Prisma, SupportCaseStatus, SupportMessageAuthorType, SupportMessageVisibility } from "@prisma/client";
import type { PaginatedDto, SupportCaseDetailDto, SupportCaseSummaryDto, SupportMessageDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminAccessDeniedException, InvalidSupportCaseTransitionException, SupportCaseNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { InternalNoteService } from "../notes/internal-note.service";
import { SUPPORT_CASE_TRANSITIONS } from "./support-case-transitions";
import { toSupportCaseDetailDto, toSupportCaseSummaryDto, toSupportMessageDto } from "./support-case.mapper";
import type { CreateSupportCaseDto } from "./dto/support-case.dto";

const CASE_INCLUDE = { assignedAdmin: { include: { user: true } }, requesterUser: true } as const;

export interface ListSupportCasesFilter {
  status?: SupportCaseStatus;
  assignedAdminId?: string;
}

/**
 * Owns the SupportCase lifecycle end to end (spec: "create -> assign ->
 * note -> reply -> resolve -> audit"). Every status change goes through
 * `transition()`, which locks the row (`SELECT ... FOR UPDATE`) before
 * validating against SUPPORT_CASE_TRANSITIONS — mirrors
 * InventoryReservationService's own row-locking precedent (Handoff 06) —
 * so two admins racing to change the same case's status can never both
 * apply an invalid transition; the second sees the first's committed
 * status and is validated against that, never the stale value it read
 * before locking.
 */
@Injectable()
export class SupportCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
    private readonly notes: InternalNoteService,
  ) {}

  async create(admin: ResolvedAdminContext, dto: CreateSupportCaseDto, requestId?: string): Promise<SupportCaseSummaryDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('support_case_number_seq') AS nextval`;
      // A sequence's nextval() always returns exactly one row — the
      // non-null assertion mirrors the same reasoning as the domainEventId!
      // assertion in notification-orchestrator.service.ts (Handoff 10).
      const caseNumber = `CASE-${rows[0]!.nextval.toString().padStart(6, "0")}`;

      const row = await tx.supportCase.create({
        data: {
          caseNumber,
          requesterUserId: dto.requesterUserId,
          householdId: dto.householdId,
          petId: dto.petId,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          subject: dto.subject,
          description: dto.description,
          category: dto.category,
          priority: dto.priority,
          createdByAdminId: admin.adminUserId,
        },
        include: CASE_INCLUDE,
      });

      await this.events.publish("SupportCaseCreated", { caseId: row.id, caseNumber, requesterUserId: row.requesterUserId }, { tx, aggregateType: "SupportCase", aggregateId: row.id });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "support_case.created", entityType: "SUPPORT_CASE", entityId: row.id, requestId, tx });
      return row;
    });

    return toSupportCaseSummaryDto(created);
  }

  async list(filter: ListSupportCasesFilter, query: PaginationQueryDto): Promise<PaginatedDto<SupportCaseSummaryDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportCaseWhereInput = { status: filter.status, assignedAdminId: filter.assignedAdminId };
    const [rows, total] = await Promise.all([
      this.prisma.supportCase.findMany({ where, include: CASE_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.supportCase.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toSupportCaseSummaryDto), total, page, pageSize);
  }

  async get(caseId: string): Promise<SupportCaseDetailDto> {
    const row = await this.prisma.supportCase.findUnique({ where: { id: caseId }, include: { ...CASE_INCLUDE, createdByAdmin: { include: { user: true } } } });
    if (!row) throw new SupportCaseNotFoundException({ caseId });
    const [messages, internalNotes] = await Promise.all([
      this.prisma.supportMessage.findMany({ where: { caseId }, include: { authorUser: true, authorAdmin: { include: { user: true } } }, orderBy: { createdAt: "asc" } }),
      this.notes.listForEntity(InternalNoteEntityType.SUPPORT_CASE, caseId),
    ]);
    return toSupportCaseDetailDto(row, messages.map(toSupportMessageDto), internalNotes);
  }

  async assign(admin: ResolvedAdminContext, caseId: string, assigneeAdminId: string, requestId?: string): Promise<SupportCaseSummaryDto> {
    const assignee = await this.prisma.adminUser.findUnique({ where: { id: assigneeAdminId } });
    if (!assignee || assignee.status !== AdminMembershipStatus.ACTIVE) {
      throw new AdminAccessDeniedException({ reason: "ASSIGNEE_NOT_ACTIVE_ADMIN", assigneeAdminId });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!existing) throw new SupportCaseNotFoundException({ caseId });
      // A plain atomic UPDATE already gives a deterministic final state under
      // concurrent assignment (spec: "two admins assigning same case ->
      // deterministic final state") — the last commit wins, and there is no
      // business-validity constraint on *who* may hold the assignment (unlike
      // a status transition, any ACTIVE admin is always a valid assignee).
      const row = await tx.supportCase.update({ where: { id: caseId }, data: { assignedAdminId: assigneeAdminId }, include: CASE_INCLUDE });
      await this.events.publish("SupportCaseAssigned", { caseId, assigneeAdminId, previousAssigneeAdminId: existing.assignedAdminId }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "support_case.assigned", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { assigneeAdminId }, requestId, tx });
      return row;
    });

    return toSupportCaseSummaryDto(updated);
  }

  async transition(admin: ResolvedAdminContext, caseId: string, to: SupportCaseStatus, requestId?: string): Promise<SupportCaseSummaryDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "support_cases" WHERE "id" = ${caseId}::uuid FOR UPDATE`;
      if (!locked) throw new SupportCaseNotFoundException({ caseId });

      const current = await tx.supportCase.findUniqueOrThrow({ where: { id: caseId } });
      if (current.status === to) return tx.supportCase.findUniqueOrThrow({ where: { id: caseId }, include: CASE_INCLUDE });

      const allowed = SUPPORT_CASE_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(to)) {
        throw new InvalidSupportCaseTransitionException({ caseId, from: current.status, to });
      }

      const data: Prisma.SupportCaseUpdateInput = { status: to };
      if (to === SupportCaseStatus.RESOLVED && !current.resolvedAt) data.resolvedAt = new Date();
      if (to === SupportCaseStatus.CLOSED && !current.closedAt) data.closedAt = new Date();

      const row = await tx.supportCase.update({ where: { id: caseId }, data, include: CASE_INCLUDE });

      await this.events.publish("SupportCaseStatusChanged", { caseId, from: current.status, to }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      if (to === SupportCaseStatus.RESOLVED) {
        await this.events.publish("SupportCaseResolved", { caseId, caseNumber: row.caseNumber, requesterUserId: row.requesterUserId }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      }
      if (to === SupportCaseStatus.CLOSED) {
        await this.events.publish("SupportCaseClosed", { caseId, requesterUserId: row.requesterUserId }, { tx, aggregateType: "SupportCase", aggregateId: caseId });
      }
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "support_case.status_changed",
        entityType: "SUPPORT_CASE",
        entityId: caseId,
        beforeSummary: { status: current.status },
        afterSummary: { status: to },
        requestId,
        tx,
      });

      return row;
    });

    return toSupportCaseSummaryDto(updated);
  }

  async postMessage(admin: ResolvedAdminContext, caseId: string, body: string, visibility: SupportMessageVisibility, requestId?: string): Promise<SupportMessageDto> {
    const message = await this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.supportCase.findUnique({ where: { id: caseId } });
      if (!supportCase) throw new SupportCaseNotFoundException({ caseId });

      const created = await tx.supportMessage.create({
        data: { caseId, authorType: SupportMessageAuthorType.ADMIN, authorAdminId: admin.adminUserId, body, visibility },
        include: { authorUser: true, authorAdmin: { include: { user: true } } },
      });

      // Enforced at the query layer everywhere a consumer-facing endpoint
      // could ever read this table (there is none in this handoff) — see
      // SupportMessageVisibility's own doc comment in schema.prisma. The
      // notification fan-out below only ever fires for PUBLIC messages, by
      // construction: an INTERNAL message never reaches NotifyInput at all.
      if (visibility === SupportMessageVisibility.PUBLIC) {
        await this.events.publish(
          "SupportMessagePosted",
          { caseId, caseNumber: supportCase.caseNumber, requesterUserId: supportCase.requesterUserId, visibility },
          { tx, aggregateType: "SupportCase", aggregateId: caseId },
        );
      }
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "support_message.posted", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { visibility }, requestId, tx });

      return created;
    });

    return toSupportMessageDto(message);
  }
}

