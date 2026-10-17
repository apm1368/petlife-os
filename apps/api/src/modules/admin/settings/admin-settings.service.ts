import { Injectable } from "@nestjs/common";
import { PlatformSettingChangeStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminGovernanceRuleException, NotFoundApiException, SettingChangeConflictException, ValidationApiException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { roleHasPermission } from "../auth/admin-permissions";
import { PlatformSettingsService } from "../../platform-settings/platform-settings.service";
import { settingDefinition, validateSettingValue } from "../../platform-settings/setting-definitions";

type Tx = Prisma.TransactionClient;
const json = (v: unknown) => (v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

/**
 * ERP-A settings workflow. A change names the version it was based on (optimistic concurrency). Harmless keys apply at
 * once; high-impact keys are stored PENDING and only a *different* admin holding settings.approve can apply them —
 * applying re-checks the base version, so an approval can never overwrite a newer value. Everything is audited.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  async list() {
    await this.settings.refresh();
    const pending = await this.prisma.platformSettingChange.groupBy({ by: ["key"], where: { status: PlatformSettingChangeStatus.PENDING }, _count: { _all: true } });
    return this.settings.describeAll().map((s) => ({ ...s, pendingChanges: pending.find((p) => p.key === s.key)?._count._all ?? 0 }));
  }

  async propose(actor: ResolvedAdminContext, key: string, input: { value: unknown; baseVersion: number; reason: string }) {
    const def = settingDefinition(key);
    if (!def) throw new NotFoundApiException("Setting", { key });
    if (input.value === undefined) throw new ValidationApiException({ field: "value", reason: "REQUIRED", key });
    const valid = validateSettingValue(def, input.value);
    if (!valid.ok) throw new ValidationApiException({ field: "value", reason: valid.reason, key });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"setting:" + key}))`;
      const current = await tx.platformSetting.findUnique({ where: { key } });
      const version = current?.version ?? 0;
      if (input.baseVersion !== version) throw new SettingChangeConflictException({ key, currentVersion: version });
      const previous = current ? current.value : this.settings.get(key);
      if (JSON.stringify(previous) === JSON.stringify(valid.value)) throw new ValidationApiException({ field: "value", reason: "UNCHANGED", key });
      const change = await tx.platformSettingChange.create({
        data: { key, previousValue: json(previous), proposedValue: json(valid.value), baseVersion: version, status: def.highImpact ? PlatformSettingChangeStatus.PENDING : PlatformSettingChangeStatus.APPLIED, reason: input.reason, requestedByAdminId: actor.adminUserId, reviewedAt: def.highImpact ? null : new Date() },
      });
      await this.audit.record({ adminUserId: actor.adminUserId, action: def.highImpact ? "setting.change_proposed" : "setting.changed", entityType: "PlatformSetting", entityId: key, reason: input.reason, beforeSummary: { value: previous, version }, afterSummary: { value: valid.value }, tx });
      if (!def.highImpact) await this.apply(tx, actor, key, valid.value, version, change.id);
      return change;
    });
    await this.settings.refresh();
    return this.toChangeDto(result.id);
  }

  async review(actor: ResolvedAdminContext, changeId: string, decision: "APPROVE" | "REJECT", note?: string) {
    if (!roleHasPermission(actor.role, "settings.approve")) throw new AdminGovernanceRuleException({ rule: "APPROVER_REQUIRED" });
    await this.prisma.$transaction(async (tx) => {
      const change = await tx.platformSettingChange.findUnique({ where: { id: changeId } });
      if (!change) throw new NotFoundApiException("SettingChange");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"setting:" + change.key}))`;
      const fresh = await tx.platformSettingChange.findUniqueOrThrow({ where: { id: changeId } });
      if (fresh.status !== PlatformSettingChangeStatus.PENDING) throw new SettingChangeConflictException({ changeId, status: fresh.status, reason: fresh.status === PlatformSettingChangeStatus.SUPERSEDED ? "SUPERSEDED" : "NOT_PENDING" });
      if (fresh.requestedByAdminId === actor.adminUserId) throw new AdminGovernanceRuleException({ rule: "SELF_APPROVAL_FORBIDDEN" });
      if (decision === "REJECT") {
        await tx.platformSettingChange.update({ where: { id: changeId }, data: { status: PlatformSettingChangeStatus.REJECTED, reviewedByAdminId: actor.adminUserId, reviewNote: note ?? null, reviewedAt: new Date() } });
        await this.audit.record({ adminUserId: actor.adminUserId, action: "setting.change_rejected", entityType: "PlatformSetting", entityId: fresh.key, reason: note, afterSummary: { changeId }, tx });
        return;
      }
      const current = await tx.platformSetting.findUnique({ where: { key: fresh.key } });
      // Defensive: apply() supersedes every other pending change for the key, so a stale base should not reach here.
      if ((current?.version ?? 0) !== fresh.baseVersion) throw new SettingChangeConflictException({ changeId, reason: "SUPERSEDED", currentVersion: current?.version ?? 0 });
      await tx.platformSettingChange.update({ where: { id: changeId }, data: { status: PlatformSettingChangeStatus.APPLIED, reviewedByAdminId: actor.adminUserId, reviewNote: note ?? null, reviewedAt: new Date() } });
      await this.audit.record({ adminUserId: actor.adminUserId, action: "setting.change_approved", entityType: "PlatformSetting", entityId: fresh.key, reason: note, beforeSummary: { value: fresh.previousValue }, afterSummary: { value: fresh.proposedValue, changeId }, tx });
      await this.apply(tx, actor, fresh.key, fresh.proposedValue, fresh.baseVersion, changeId);
    });
    await this.settings.refresh();
    return this.toChangeDto(changeId);
  }

  async cancel(actor: ResolvedAdminContext, changeId: string) {
    const done = await this.prisma.platformSettingChange.updateMany({ where: { id: changeId, status: PlatformSettingChangeStatus.PENDING, requestedByAdminId: actor.adminUserId }, data: { status: PlatformSettingChangeStatus.CANCELLED, reviewedAt: new Date() } });
    if (!done.count) throw new SettingChangeConflictException({ changeId, reason: "NOT_YOUR_PENDING_CHANGE" });
    return this.toChangeDto(changeId);
  }

  async changes(q: { key?: string; status?: PlatformSettingChangeStatus; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.PlatformSettingChangeWhereInput = { ...(q.key ? { key: q.key } : {}), ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await Promise.all([this.prisma.platformSettingChange.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), this.prisma.platformSettingChange.count({ where })]);
    return toPaginatedDto(await this.withNames(rows), total, page, pageSize);
  }

  private async apply(tx: Tx, actor: ResolvedAdminContext, key: string, value: unknown, baseVersion: number, changeId: string) {
    const data = { value: json(value) as Prisma.InputJsonValue, version: baseVersion + 1, updatedByAdminId: actor.adminUserId };
    await tx.platformSetting.upsert({ where: { key }, create: { key, ...data }, update: data });
    // Any other pending proposal was based on the old version: it can never apply now.
    await tx.platformSettingChange.updateMany({ where: { key, status: PlatformSettingChangeStatus.PENDING, id: { not: changeId } }, data: { status: PlatformSettingChangeStatus.SUPERSEDED, reviewedAt: new Date() } });
    await this.events.publish("PlatformSettingChanged", { key, version: baseVersion + 1, changeId, actorAdminUserId: actor.adminUserId }, { tx, aggregateType: "PlatformSetting", aggregateId: key });
  }

  private async toChangeDto(id: string) {
    const row = await this.prisma.platformSettingChange.findUniqueOrThrow({ where: { id } });
    return (await this.withNames([row]))[0]!;
  }

  private async withNames(rows: Prisma.PlatformSettingChangeGetPayload<object>[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.requestedByAdminId, r.reviewedByAdminId].filter((x): x is string => Boolean(x))))];
    const admins = await this.prisma.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, user: { select: { displayName: true } } } });
    const name = (id: string | null) => (id ? (admins.find((a) => a.id === id) ?? null) : null);
    return rows.map((r) => ({
      id: r.id, key: r.key, status: r.status, previousValue: r.previousValue, proposedValue: r.proposedValue, baseVersion: r.baseVersion, reason: r.reason, reviewNote: r.reviewNote,
      requestedBy: name(r.requestedByAdminId) && { id: r.requestedByAdminId, displayName: name(r.requestedByAdminId)!.user.displayName, role: name(r.requestedByAdminId)!.role },
      reviewedBy: r.reviewedByAdminId && name(r.reviewedByAdminId) ? { id: r.reviewedByAdminId, displayName: name(r.reviewedByAdminId)!.user.displayName, role: name(r.reviewedByAdminId)!.role } : null,
      createdAt: r.createdAt.toISOString(), reviewedAt: r.reviewedAt?.toISOString() ?? null,
    }));
  }
}
