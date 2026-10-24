import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminGovernanceRuleException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { ROLE_PERMISSIONS, type AdminPermission } from "../auth/admin-permissions";

/** Roles whose holders may not be created, changed or suspended by anyone but a SUPER_ADMIN (all of access control is admin.manage = SUPER_ADMIN today; the rule is explicit so delegating admin.manage later can't escalate). */
const PROTECTED_ROLES: AdminRole[] = [AdminRole.SUPER_ADMIN];

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [name, domain] = email.split("@");
  return domain ? `${(name ?? "").slice(0, 2)}***@${domain}` : "***";
}

/**
 * ERP-A access control: the role catalogue and admin membership lifecycle (grant, change role, suspend, reactivate).
 * Invariants: at least one ACTIVE SUPER_ADMIN always remains (checked under a transaction-scoped advisory lock so two
 * concurrent demotions can't both pass); nobody changes or suspends their own membership; every change is audited and
 * emits AdminMembershipChanged. A suspended admin loses access on the very next request (the guard resolves per call).
 */
@Injectable()
export class AdminAccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  async roles() {
    const counts = await this.prisma.adminUser.groupBy({ by: ["role", "status"], _count: { _all: true } });
    const count = (role: AdminRole, status: AdminMembershipStatus) => counts.find((c) => c.role === role && c.status === status)?._count._all ?? 0;
    return (Object.values(AdminRole) as AdminRole[]).map((role) => ({
      role,
      protected: PROTECTED_ROLES.includes(role),
      permissions: ROLE_PERMISSIONS[role],
      activeMembers: count(role, AdminMembershipStatus.ACTIVE),
      suspendedMembers: count(role, AdminMembershipStatus.SUSPENDED),
    }));
  }

  permissions() {
    const all = ROLE_PERMISSIONS[AdminRole.SUPER_ADMIN];
    return all.map((permission: AdminPermission) => ({
      permission,
      domain: permission.split(".")[0],
      roles: (Object.keys(ROLE_PERMISSIONS) as AdminRole[]).filter((r) => ROLE_PERMISSIONS[r].includes(permission)),
    }));
  }

  async list(q: { role?: AdminRole; status?: AdminMembershipStatus; q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.AdminUserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { user: { OR: [{ displayName: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.adminUser.findMany({ where, include: { user: { select: { displayName: true, email: true } } }, orderBy: [{ status: "asc" }, { createdAt: "asc" }], skip, take }),
      this.prisma.adminUser.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => this.toDto(r)), total, page, pageSize);
  }

  async get(adminUserId: string) {
    const row = await this.prisma.adminUser.findUnique({ where: { id: adminUserId }, include: { user: { select: { displayName: true, email: true } } } });
    if (!row) throw new NotFoundApiException("AdminUser");
    return { ...this.toDto(row), permissions: ROLE_PERMISSIONS[row.role] };
  }

  /** Grant admin access to an existing member account (by email). Never creates a login. */
  async grant(actor: ResolvedAdminContext, input: { email: string; role: AdminRole; reason: string }) {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: input.email.trim(), mode: "insensitive" } }, select: { id: true } });
    if (!user) throw new NotFoundApiException("User");
    this.assertMayAssign(actor, input.role);
    return this.mutate(actor, async (tx) => {
      const existing = await tx.adminUser.findUnique({ where: { userId: user.id } });
      if (existing) throw new AdminGovernanceRuleException({ rule: "ALREADY_ADMIN", adminUserId: existing.id });
      const created = await tx.adminUser.create({ data: { userId: user.id, role: input.role } });
      return { row: created, action: "admin_user.granted" as const, before: null, after: { role: created.role, status: created.status } };
    }, input.reason);
  }

  async changeRole(actor: ResolvedAdminContext, adminUserId: string, role: AdminRole, reason: string) {
    this.assertMayAssign(actor, role);
    return this.mutate(actor, async (tx) => {
      const row = await this.lockTarget(tx, actor, adminUserId);
      if (row.role === role) throw new ValidationApiException({ field: "role", reason: "UNCHANGED" });
      if (row.role === AdminRole.SUPER_ADMIN && row.status === AdminMembershipStatus.ACTIVE) await this.assertNotLastSuperAdmin(tx);
      const updated = await tx.adminUser.update({ where: { id: row.id }, data: { role } });
      return { row: updated, action: "admin_user.role_changed" as const, before: { role: row.role }, after: { role } };
    }, reason);
  }

  async setStatus(actor: ResolvedAdminContext, adminUserId: string, status: AdminMembershipStatus, reason: string) {
    return this.mutate(actor, async (tx) => {
      const row = await this.lockTarget(tx, actor, adminUserId);
      if (row.status === status) throw new ValidationApiException({ field: "status", reason: "UNCHANGED" });
      if (status === AdminMembershipStatus.SUSPENDED && row.role === AdminRole.SUPER_ADMIN) await this.assertNotLastSuperAdmin(tx);
      const updated = await tx.adminUser.update({ where: { id: row.id }, data: { status } });
      const action = status === AdminMembershipStatus.SUSPENDED ? ("admin_user.suspended" as const) : ("admin_user.reactivated" as const);
      return { row: updated, action, before: { status: row.status }, after: { status } };
    }, reason);
  }

  private assertMayAssign(actor: ResolvedAdminContext, role: AdminRole) {
    if (PROTECTED_ROLES.includes(role) && actor.role !== AdminRole.SUPER_ADMIN) throw new AdminGovernanceRuleException({ rule: "PROTECTED_ROLE", role });
  }

  private async lockTarget(tx: Prisma.TransactionClient, actor: ResolvedAdminContext, adminUserId: string) {
    const row = await tx.adminUser.findUnique({ where: { id: adminUserId } });
    if (!row) throw new NotFoundApiException("AdminUser");
    if (row.id === actor.adminUserId) throw new AdminGovernanceRuleException({ rule: "SELF_CHANGE_FORBIDDEN" });
    if (PROTECTED_ROLES.includes(row.role) && actor.role !== AdminRole.SUPER_ADMIN) throw new AdminGovernanceRuleException({ rule: "PROTECTED_ROLE", role: row.role });
    return row;
  }

  private async assertNotLastSuperAdmin(tx: Prisma.TransactionClient) {
    const remaining = await tx.adminUser.count({ where: { role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    if (remaining <= 1) throw new AdminGovernanceRuleException({ rule: "LAST_SUPER_ADMIN" });
  }

  private async mutate(
    actor: ResolvedAdminContext,
    change: (tx: Prisma.TransactionClient) => Promise<{ row: { id: string; userId: string; role: AdminRole; status: AdminMembershipStatus }; action: "admin_user.granted" | "admin_user.role_changed" | "admin_user.suspended" | "admin_user.reactivated"; before: Record<string, unknown> | null; after: Record<string, unknown> }>,
    reason: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      // One membership change at a time platform-wide: makes the last-SUPER_ADMIN count race-free.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin-membership-change'))`;
      const r = await change(tx);
      await this.audit.record({ adminUserId: actor.adminUserId, action: r.action, entityType: "AdminUser", entityId: r.row.id, reason, beforeSummary: r.before ?? undefined, afterSummary: r.after, tx });
      await this.events.publish("AdminMembershipChanged", { adminUserId: r.row.id, userId: r.row.userId, action: r.action, actorAdminUserId: actor.adminUserId, ...r.after }, { tx, aggregateType: "AdminUser", aggregateId: r.row.id });
      return r.row;
    });
    return this.get(result.id);
  }

  private toDto(r: { id: string; userId: string; role: AdminRole; status: AdminMembershipStatus; createdAt: Date; updatedAt: Date; lastActiveAt: Date | null; user: { displayName: string | null; email: string | null } }) {
    return { id: r.id, userId: r.userId, displayName: r.user.displayName, emailMasked: maskEmail(r.user.email), role: r.role, status: r.status, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), lastActiveAt: r.lastActiveAt?.toISOString() ?? null };
  }
}
