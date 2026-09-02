import { Injectable } from "@nestjs/common";
import { AdminTaskStatus, type Prisma } from "@prisma/client";
import type { AdminTaskDto, PaginatedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminTaskNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import type { CreateAdminTaskDto, UpdateAdminTaskDto } from "./dto/admin-task.dto";

const TASK_INCLUDE = { assigneeAdmin: { include: { user: true } }, createdByAdmin: { include: { user: true } } } as const;
type TaskWithRelations = Prisma.AdminTaskGetPayload<{ include: typeof TASK_INCLUDE }>;

function toTaskDto(row: TaskWithRelations): AdminTaskDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assigneeAdmin: row.assigneeAdmin ? { id: row.assigneeAdmin.id, displayName: row.assigneeAdmin.user.displayName, role: row.assigneeAdmin.role as never } : null,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    status: row.status as never,
    priority: row.priority as never,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdByAdmin: { id: row.createdByAdmin.id, displayName: row.createdByAdmin.user.displayName, role: row.createdByAdmin.role as never },
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ListAdminTasksFilter {
  status?: AdminTaskStatus;
  assigneeAdminId?: string;
}

/**
 * Lightweight follow-ups (spec: "Tasks/follow-ups") — deliberately no
 * centralized transition table the way SupportCase/Dispute/TrustCase have
 * one: a task's only meaningful states are open/in-progress/done/cancelled
 * with no domain-validity constraint on which follows which (an admin may
 * freely reopen or cancel a task at any point), so a plain status write is
 * enough here.
 */
@Injectable()
export class AdminTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async create(admin: ResolvedAdminContext, dto: CreateAdminTaskDto, requestId?: string): Promise<AdminTaskDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.adminTask.create({
        data: {
          title: dto.title,
          description: dto.description,
          assigneeAdminId: dto.assigneeAdminId,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          priority: dto.priority,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          createdByAdminId: admin.adminUserId,
        },
        include: TASK_INCLUDE,
      });
      await this.events.publish("AdminTaskCreated", { taskId: row.id }, { tx, aggregateType: "AdminTask", aggregateId: row.id });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_task.created", entityType: "ADMIN_TASK", entityId: row.id, requestId, tx });
      return row;
    });
    return toTaskDto(created);
  }

  async list(filter: ListAdminTasksFilter, query: PaginationQueryDto): Promise<PaginatedDto<AdminTaskDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.AdminTaskWhereInput = { status: filter.status, assigneeAdminId: filter.assigneeAdminId };
    const [rows, total] = await Promise.all([
      this.prisma.adminTask.findMany({ where, include: TASK_INCLUDE, orderBy: [{ status: "asc" }, { dueAt: "asc" }], skip, take }),
      this.prisma.adminTask.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toTaskDto), total, page, pageSize);
  }

  async update(admin: ResolvedAdminContext, taskId: string, dto: UpdateAdminTaskDto, requestId?: string): Promise<AdminTaskDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.adminTask.findUnique({ where: { id: taskId } });
      if (!existing) throw new AdminTaskNotFoundException({ taskId });

      const data: Prisma.AdminTaskUpdateInput = {};
      if (dto.assigneeAdminId !== undefined) data.assigneeAdmin = { connect: { id: dto.assigneeAdminId } };
      if (dto.status !== undefined) {
        data.status = dto.status;
        if (dto.status === AdminTaskStatus.DONE && !existing.completedAt) data.completedAt = new Date();
      }

      const row = await tx.adminTask.update({ where: { id: taskId }, data, include: TASK_INCLUDE });
      if (dto.status === AdminTaskStatus.DONE) {
        await this.events.publish("AdminTaskCompleted", { taskId }, { tx, aggregateType: "AdminTask", aggregateId: taskId });
        await this.auditLog.record({ adminUserId: admin.adminUserId, action: "admin_task.completed", entityType: "ADMIN_TASK", entityId: taskId, requestId, tx });
      }
      return row;
    });
    return toTaskDto(updated);
  }
}
