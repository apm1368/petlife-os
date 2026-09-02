import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminAuditLogService } from "./admin-audit-log.service";
import { ListAuditQueryDto } from "./dto/list-audit-query.dto";

/** The audit trail surface (spec: "/admin/audit") — every list here is scoped to either one entity or one admin actor, never an unbounded dump of the whole table. */
@Controller("admin/audit")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminAuditController {
  constructor(private readonly auditLog: AdminAuditLogService) {}

  @Get()
  @RequireAdminPermission("audit.view")
  list(@Query() query: ListAuditQueryDto) {
    if (query.entityType && query.entityId) return this.auditLog.listForEntity(query.entityType, query.entityId, query);
    if (query.adminUserId) return this.auditLog.listForAdmin(query.adminUserId, query);
    return this.auditLog.listRecent(query);
  }
}
