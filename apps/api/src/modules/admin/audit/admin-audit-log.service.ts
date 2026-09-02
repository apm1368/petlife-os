import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AdminAuditLogDto, AdminRole } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import type { AdminAuditAction } from "./admin-audit-action";

export interface RecordAuditInput {
  adminUserId: string;
  action: AdminAuditAction;
  entityType: string;
  entityId?: string;
  reason?: string;
  /**
   * Summaries, never full entity dumps — spec: "never log secrets/raw
   * sensitive health data/full phone-email unnecessarily". Callers should
   * pass a small set of changed fields (e.g. `{ status: "OPEN" }` /
   * `{ status: "RESOLVED" }`), using maskPhone/maskEmail for any contact
   * field they choose to include, never a raw PII value.
   */
  beforeSummary?: Record<string, unknown>;
  afterSummary?: Record<string, unknown>;
  requestId?: string;
  /** Pass the same $transaction callback's tx here to commit the audit row atomically with the mutation it describes — mirrors DomainEventsService.publish's own `tx` option. */
  tx?: Prisma.TransactionClient;
}

/**
 * The single write path for `admin_audit_logs` (spec: "every consequential
 * admin mutation logged with actor/action/entity/before-after/reason/
 * requestId"). Every admin service that mutates state calls `record()` in
 * the same transaction as the mutation itself, so an audit row can never be
 * silently skipped by a partial failure.
 */
@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    const client = input.tx ?? this.prisma;
    await client.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason,
        beforeSummary: input.beforeSummary as Prisma.InputJsonValue | undefined,
        afterSummary: input.afterSummary as Prisma.InputJsonValue | undefined,
        requestId: input.requestId,
      },
    });
  }

  async listForEntity(entityType: string, entityId: string, query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = { entityType, entityId };
    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ where, include: { adminUser: { include: { user: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toAuditLogDto), total, page, pageSize);
  }

  async listForAdmin(adminUserId: string, query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = { adminUserId };
    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ where, include: { adminUser: { include: { user: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toAuditLogDto), total, page, pageSize);
  }

  /** The unfiltered audit feed (spec: "/admin/audit") — still paginated, never an unbounded dump. */
  async listRecent(query: PaginationQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ include: { adminUser: { include: { user: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.adminAuditLog.count(),
    ]);
    return toPaginatedDto(rows.map(toAuditLogDto), total, page, pageSize);
  }
}

type AuditLogWithAdmin = Prisma.AdminAuditLogGetPayload<{ include: { adminUser: { include: { user: true } } } }>;

function toAuditLogDto(row: AuditLogWithAdmin): AdminAuditLogDto {
  return {
    id: row.id,
    adminUser: { id: row.adminUser.id, displayName: row.adminUser.user.displayName, role: row.adminUser.role as unknown as AdminRole },
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    reason: row.reason,
    beforeSummary: (row.beforeSummary as Record<string, unknown> | null) ?? null,
    afterSummary: (row.afterSummary as Record<string, unknown> | null) ?? null,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
  };
}
