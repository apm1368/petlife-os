import { Injectable } from "@nestjs/common";
import { Prisma, TrustCaseStatus } from "@prisma/client";
import type { PaginatedDto, TrustCaseDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { InvalidTrustCaseTransitionException, TrustCaseNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { TRUST_CASE_TRANSITIONS } from "./trust-case-transitions";
import { toTrustCaseDto } from "./trust.mapper";
import type { OpenTrustCaseDto } from "./dto/trust.dto";

const ACTION_INCLUDE = { include: { performedByAdmin: { include: { user: true } }, appeal: { include: { reviewerAdmin: { include: { user: true } } } } } } as const;
export const TRUST_CASE_INCLUDE = { assignedAdmin: { include: { user: true } }, openedByAdmin: { include: { user: true } }, actions: ACTION_INCLUDE } as const;

export interface ListTrustCasesFilter {
  status?: TrustCaseStatus;
  assignedAdminId?: string;
}

/**
 * Owns the TrustCase lifecycle — case creation/assignment/transition only;
 * the operational-state-mutation side of a trust action (suspend/restrict/
 * restore a subject) lives in TrustActionService, kept separate so this
 * service never touches ProviderOrganization/SellerOrganization directly.
 */
@Injectable()
export class TrustCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async open(admin: ResolvedAdminContext, dto: OpenTrustCaseDto, requestId?: string): Promise<TrustCaseDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.trustCase.create({
        data: { subjectType: dto.subjectType, subjectId: dto.subjectId, reason: dto.reason, severity: dto.severity, openedByAdminId: admin.adminUserId },
        include: TRUST_CASE_INCLUDE,
      });
      await this.events.publish("TrustCaseOpened", { trustCaseId: row.id, subjectType: row.subjectType, subjectId: row.subjectId }, { tx, aggregateType: "TrustCase", aggregateId: row.id });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "trust_case.opened", entityType: "TRUST_CASE", entityId: row.id, requestId, tx });
      return row;
    });
    return toTrustCaseDto(created);
  }

  async list(filter: ListTrustCasesFilter, query: PaginationQueryDto): Promise<PaginatedDto<TrustCaseDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.TrustCaseWhereInput = { status: filter.status, assignedAdminId: filter.assignedAdminId };
    const [rows, total] = await Promise.all([
      this.prisma.trustCase.findMany({ where, include: TRUST_CASE_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.trustCase.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toTrustCaseDto), total, page, pageSize);
  }

  async get(trustCaseId: string): Promise<TrustCaseDto> {
    const row = await this.prisma.trustCase.findUnique({ where: { id: trustCaseId }, include: TRUST_CASE_INCLUDE });
    if (!row) throw new TrustCaseNotFoundException({ trustCaseId });
    return toTrustCaseDto(row);
  }

  async assign(admin: ResolvedAdminContext, trustCaseId: string, assigneeAdminId: string, requestId?: string): Promise<TrustCaseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.trustCase.findUnique({ where: { id: trustCaseId } });
      if (!existing) throw new TrustCaseNotFoundException({ trustCaseId });
      const row = await tx.trustCase.update({ where: { id: trustCaseId }, data: { assignedAdminId: assigneeAdminId }, include: TRUST_CASE_INCLUDE });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "trust_case.assigned", entityType: "TRUST_CASE", entityId: trustCaseId, afterSummary: { assigneeAdminId }, requestId, tx });
      return row;
    });
    return toTrustCaseDto(updated);
  }

  async transition(admin: ResolvedAdminContext, trustCaseId: string, to: TrustCaseStatus, requestId?: string): Promise<TrustCaseDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "trust_cases" WHERE "id" = ${trustCaseId}::uuid FOR UPDATE`;
      if (!locked) throw new TrustCaseNotFoundException({ trustCaseId });

      const current = await tx.trustCase.findUniqueOrThrow({ where: { id: trustCaseId } });
      if (current.status === to) return tx.trustCase.findUniqueOrThrow({ where: { id: trustCaseId }, include: TRUST_CASE_INCLUDE });

      const allowed = TRUST_CASE_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(to)) throw new InvalidTrustCaseTransitionException({ trustCaseId, from: current.status, to });

      const data: Prisma.TrustCaseUpdateInput = { status: to };
      if (to === TrustCaseStatus.CLOSED && !current.closedAt) data.closedAt = new Date();

      const row = await tx.trustCase.update({ where: { id: trustCaseId }, data, include: TRUST_CASE_INCLUDE });
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "trust_case.status_changed",
        entityType: "TRUST_CASE",
        entityId: trustCaseId,
        beforeSummary: { status: current.status },
        afterSummary: { status: to },
        requestId,
        tx,
      });
      return row;
    });
    return toTrustCaseDto(updated);
  }
}
