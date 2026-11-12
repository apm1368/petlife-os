import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, AdminVertical, Prisma } from "@prisma/client";
import type { AdminCustomRoleDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminGovernanceRuleException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CUSTOM_ROLE_FORBIDDEN, isAdminPermission, type AdminPermission } from "../auth/admin-permissions";

export interface CustomRoleInput {
  name: string;
  description?: string | null;
  permissions: string[];
  verticals: AdminVertical[];
}

type RoleRow = Prisma.AdminCustomRoleGetPayload<{ include: { _count: { select: { members: true } } } }>;

/**
 * Owner-defined admin roles. Only admin.manage (SUPER_ADMIN) creates, edits, archives and assigns them; every change
 * carries a reason and is audited in the same transaction. Guarantees, enforced here and again in the database:
 *  - a role never carries admin.manage, so role management cannot be delegated;
 *  - a SUPER_ADMIN is never given a custom role (the last-super-admin invariant relies on the built-in role);
 *  - nobody assigns a role to themselves;
 *  - a role with members cannot be archived (reassign them first), and archived roles cannot be assigned.
 * An edit applies to members on their very next request (the guard resolves permissions per call).
 */
@Injectable()
export class AdminCustomRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  async list(includeArchived = false): Promise<AdminCustomRoleDto[]> {
    const rows = await this.prisma.adminCustomRole.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      include: { _count: { select: { members: true } } },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(actor: ResolvedAdminContext, input: CustomRoleInput, reason: string): Promise<AdminCustomRoleDto> {
    const data = this.validate(input);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.assertNameFree(tx, data.name);
      const created = await tx.adminCustomRole.create({
        data: { ...data, createdByAdminId: actor.adminUserId, updatedByAdminId: actor.adminUserId },
        include: { _count: { select: { members: true } } },
      });
      await this.audit.record({ adminUserId: actor.adminUserId, action: "admin_role.created", entityType: "AdminCustomRole", entityId: created.id, reason, afterSummary: this.summary(created), tx });
      return created;
    });
    return this.toDto(row);
  }

  async update(actor: ResolvedAdminContext, id: string, input: CustomRoleInput, reason: string): Promise<AdminCustomRoleDto> {
    const data = this.validate(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.adminCustomRole.findUnique({ where: { id } });
      if (!before) throw new NotFoundApiException("AdminCustomRole");
      if (before.archivedAt) throw new AdminGovernanceRuleException({ rule: "ROLE_ARCHIVED" });
      if (before.name.trim().toLowerCase() !== data.name.toLowerCase()) await this.assertNameFree(tx, data.name);
      const updated = await tx.adminCustomRole.update({ where: { id }, data: { ...data, updatedByAdminId: actor.adminUserId }, include: { _count: { select: { members: true } } } });
      await this.audit.record({ adminUserId: actor.adminUserId, action: "admin_role.updated", entityType: "AdminCustomRole", entityId: id, reason, beforeSummary: this.summary(before), afterSummary: this.summary(updated), tx });
      return updated;
    });
    return this.toDto(row);
  }

  async archive(actor: ResolvedAdminContext, id: string, reason: string): Promise<AdminCustomRoleDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.adminCustomRole.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
      if (!before) throw new NotFoundApiException("AdminCustomRole");
      if (before.archivedAt) throw new AdminGovernanceRuleException({ rule: "ROLE_ARCHIVED" });
      if (before._count.members > 0) throw new AdminGovernanceRuleException({ rule: "ROLE_IN_USE", members: before._count.members });
      const archived = await tx.adminCustomRole.update({ where: { id }, data: { archivedAt: new Date(), updatedByAdminId: actor.adminUserId }, include: { _count: { select: { members: true } } } });
      await this.audit.record({ adminUserId: actor.adminUserId, action: "admin_role.archived", entityType: "AdminCustomRole", entityId: id, reason, beforeSummary: this.summary(before), tx });
      return archived;
    });
    return this.toDto(row);
  }

  /** Assign a live custom role to a membership, or clear it (customRoleId null) to restore the built-in role. */
  async assign(actor: ResolvedAdminContext, adminUserId: string, customRoleId: string | null, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      // Same platform-wide serialisation as every other membership change (admin-access-control.service.ts).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-membership-change'))`;
      const target = await tx.adminUser.findUnique({ where: { id: adminUserId }, include: { customRole: { select: { id: true, name: true } } } });
      if (!target) throw new NotFoundApiException("AdminUser");
      if (target.id === actor.adminUserId) throw new AdminGovernanceRuleException({ rule: "SELF_CHANGE_FORBIDDEN" });
      if (target.role === AdminRole.SUPER_ADMIN) throw new AdminGovernanceRuleException({ rule: "PROTECTED_ROLE", role: target.role });
      if ((target.customRoleId ?? null) === customRoleId) throw new ValidationApiException({ field: "customRoleId", reason: "UNCHANGED" });
      let role: { id: string; name: string } | null = null;
      if (customRoleId) {
        const found = await tx.adminCustomRole.findUnique({ where: { id: customRoleId } });
        if (!found) throw new NotFoundApiException("AdminCustomRole");
        if (found.archivedAt) throw new AdminGovernanceRuleException({ rule: "ROLE_ARCHIVED" });
        role = { id: found.id, name: found.name };
      }
      const updated = await tx.adminUser.update({ where: { id: target.id }, data: { customRoleId } });
      const action = customRoleId ? ("admin_user.custom_role_assigned" as const) : ("admin_user.custom_role_cleared" as const);
      const before = { role: target.role, customRole: target.customRole };
      const after = { role: updated.role, customRole: role };
      await this.audit.record({ adminUserId: actor.adminUserId, action, entityType: "AdminUser", entityId: target.id, reason, beforeSummary: before, afterSummary: after, tx });
      await this.events.publish(
        "AdminMembershipChanged",
        { adminUserId: target.id, userId: target.userId, action, actorAdminUserId: actor.adminUserId, role: updated.role, status: updated.status, customRoleId },
        { tx, aggregateType: "AdminUser", aggregateId: target.id },
      );
      return { adminUserId: target.id, customRole: role, status: updated.status as AdminMembershipStatus };
    });
  }

  private validate(input: CustomRoleInput): { name: string; description: string | null; permissions: AdminPermission[]; verticals: AdminVertical[] } {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 60) throw new ValidationApiException({ field: "name", reason: "LENGTH" });
    const unknown = input.permissions.filter((p) => !isAdminPermission(p));
    if (unknown.length) throw new ValidationApiException({ field: "permissions", reason: "UNKNOWN_PERMISSION", unknown });
    const permissions = [...new Set(input.permissions as AdminPermission[])];
    const forbidden = permissions.filter((p) => CUSTOM_ROLE_FORBIDDEN.includes(p));
    if (forbidden.length) throw new AdminGovernanceRuleException({ rule: "PERMISSION_NOT_DELEGABLE", permissions: forbidden });
    if (!permissions.length) throw new ValidationApiException({ field: "permissions", reason: "REQUIRED" });
    const description = input.description?.trim() ? input.description.trim().slice(0, 300) : null;
    return { name, description, permissions, verticals: [...new Set(input.verticals)] };
  }

  private async assertNameFree(tx: Prisma.TransactionClient, name: string) {
    const clash = await tx.adminCustomRole.findFirst({ where: { archivedAt: null, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (clash) throw new AdminGovernanceRuleException({ rule: "ROLE_NAME_TAKEN" });
  }

  private summary(r: { name: string; description: string | null; permissions: string[]; verticals: AdminVertical[] }) {
    return { name: r.name, description: r.description, permissions: r.permissions, verticals: r.verticals };
  }

  private toDto(r: RoleRow): AdminCustomRoleDto {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      verticals: r.verticals,
      members: r._count.members,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
