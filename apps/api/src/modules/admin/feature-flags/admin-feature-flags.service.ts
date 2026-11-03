import { Injectable } from "@nestjs/common";
import { FeatureFlagChangeStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  AdminGovernanceRuleException,
  NotFoundApiException,
  SettingChangeConflictException,
  ValidationApiException,
} from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { roleHasPermission } from "../auth/admin-permissions";
import {
  evaluateFeatureFlag,
  type FeatureFlagAudience,
  type FeatureFlagSnapshot,
} from "./feature-flag-evaluator";

type FlagInput = FeatureFlagSnapshot & { description?: string };
const flagKeyPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/**
 * TC-12 / P-03 release control plane. Changes never take effect when they
 * are proposed: a different administrator with settings.approve must review
 * the exact snapshot. This keeps rollout, city and beta targeting auditable
 * and prevents a stale approval from overwriting a newer version.
 */
@Injectable()
export class AdminFeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  async list() {
    const [flags, pending] = await Promise.all([
      this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
      this.prisma.featureFlagChange.groupBy({
        by: ["flagKey"],
        where: { status: FeatureFlagChangeStatus.PENDING },
        _count: { _all: true },
      }),
    ]);
    return flags.map((flag) => ({
      ...this.toFlagDto(flag),
      pendingChanges: pending.find((row) => row.flagKey === flag.key)?._count._all ?? 0,
    }));
  }

  async get(key: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundApiException("FeatureFlag", { key });
    return this.toFlagDto(flag);
  }

  async proposeCreate(actor: ResolvedAdminContext, input: FlagInput & { key: string; reason: string }) {
    return this.propose(actor, input.key, input, 0, input.reason, true);
  }

  async proposeUpdate(
    actor: ResolvedAdminContext,
    key: string,
    input: FlagInput & { baseVersion: number; reason: string },
  ) {
    return this.propose(actor, key, input, input.baseVersion, input.reason, false);
  }

  async review(actor: ResolvedAdminContext, changeId: string, decision: "APPROVE" | "REJECT", note?: string) {
    if (!roleHasPermission(actor.role, "settings.approve"))
      throw new AdminGovernanceRuleException({ rule: "APPROVER_REQUIRED" });
    await this.prisma.$transaction(async (tx) => {
      const change = await tx.featureFlagChange.findUnique({ where: { id: changeId } });
      if (!change) throw new NotFoundApiException("FeatureFlagChange", { changeId });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"feature-flag:" + change.flagKey}))`;
      const fresh = await tx.featureFlagChange.findUniqueOrThrow({ where: { id: changeId } });
      if (fresh.status !== FeatureFlagChangeStatus.PENDING)
        throw new SettingChangeConflictException({ changeId, status: fresh.status, reason: "NOT_PENDING" });
      if (fresh.requestedByAdminId === actor.adminUserId)
        throw new AdminGovernanceRuleException({ rule: "SELF_APPROVAL_FORBIDDEN" });
      if (decision === "REJECT") {
        await tx.featureFlagChange.update({
          where: { id: changeId },
          data: {
            status: FeatureFlagChangeStatus.REJECTED,
            reviewedByAdminId: actor.adminUserId,
            reviewNote: note ?? null,
            reviewedAt: new Date(),
          },
        });
        await this.audit.record({
          adminUserId: actor.adminUserId,
          action: "feature_flag.change_rejected",
          entityType: "FeatureFlag",
          entityId: fresh.flagKey,
          reason: note,
          afterSummary: { changeId },
          tx,
        });
        return;
      }
      const current = await tx.featureFlag.findUnique({ where: { key: fresh.flagKey } });
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== fresh.baseVersion) {
        await tx.featureFlagChange.update({
          where: { id: changeId },
          data: { status: FeatureFlagChangeStatus.SUPERSEDED, reviewedAt: new Date() },
        });
        throw new SettingChangeConflictException({ changeId, reason: "SUPERSEDED", currentVersion });
      }
      const proposed = this.readSnapshot(fresh.proposedValue);
      const data = {
        description: proposed.description ?? null,
        isEnabled: proposed.isEnabled,
        rolloutPercentage: proposed.rolloutPercentage,
        cities: proposed.cities,
        betaUserIds: proposed.betaUserIds,
        version: currentVersion + 1,
        updatedByAdminId: actor.adminUserId,
      };
      if (current) await tx.featureFlag.update({ where: { key: fresh.flagKey }, data });
      else await tx.featureFlag.create({ data: { key: fresh.flagKey, ...data } });
      await tx.featureFlagChange.update({
        where: { id: changeId },
        data: {
          status: FeatureFlagChangeStatus.APPLIED,
          reviewedByAdminId: actor.adminUserId,
          reviewNote: note ?? null,
          reviewedAt: new Date(),
        },
      });
      await tx.featureFlagChange.updateMany({
        where: { flagKey: fresh.flagKey, status: FeatureFlagChangeStatus.PENDING, id: { not: changeId } },
        data: { status: FeatureFlagChangeStatus.SUPERSEDED, reviewedAt: new Date() },
      });
      await this.audit.record({
        adminUserId: actor.adminUserId,
        action: "feature_flag.change_approved",
        entityType: "FeatureFlag",
        entityId: fresh.flagKey,
        reason: note,
        beforeSummary: current ? this.auditSummary(this.snapshot(current)) : { absent: true },
        afterSummary: { ...this.auditSummary(proposed), changeId },
        tx,
      });
    });
    return this.toChangeDto(changeId);
  }

  async cancel(actor: ResolvedAdminContext, changeId: string) {
    const change = await this.prisma.$transaction(async (tx) => {
      const current = await tx.featureFlagChange.findUnique({ where: { id: changeId } });
      if (
        !current ||
        current.status !== FeatureFlagChangeStatus.PENDING ||
        current.requestedByAdminId !== actor.adminUserId
      )
        throw new SettingChangeConflictException({ changeId, reason: "NOT_YOUR_PENDING_CHANGE" });
      const changed = await tx.featureFlagChange.update({
        where: { id: changeId },
        data: { status: FeatureFlagChangeStatus.CANCELLED, reviewedAt: new Date() },
      });
      await this.audit.record({
        adminUserId: actor.adminUserId,
        action: "feature_flag.change_cancelled",
        entityType: "FeatureFlag",
        entityId: changed.flagKey,
        afterSummary: { changeId },
        tx,
      });
      return changed;
    });
    return this.toChangeDto(change.id);
  }

  async changes(q: { key?: string; status?: FeatureFlagChangeStatus; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.FeatureFlagChangeWhereInput = {
      ...(q.key ? { flagKey: q.key } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.featureFlagChange.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.featureFlagChange.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((row) => this.toChangeDtoRow(row)),
      total,
      page,
      pageSize,
    );
  }

  /** Runtime consumers call this method; it deliberately returns no beta list or admin-only metadata. */
  async evaluate(key: string, audience: FeatureFlagAudience = {}) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    return flag
      ? evaluateFeatureFlag(key, this.snapshot(flag), audience)
      : { enabled: false, reason: "DISABLED" as const };
  }

  private async propose(
    actor: ResolvedAdminContext,
    key: string,
    input: FlagInput,
    baseVersion: number,
    reason: string,
    creating: boolean,
  ) {
    if (!flagKeyPattern.test(key))
      throw new ValidationApiException({ field: "key", reason: "INVALID_FEATURE_FLAG_KEY" });
    if (!Number.isInteger(baseVersion) || baseVersion < 0)
      throw new ValidationApiException({ field: "baseVersion", reason: "INVALID_VERSION" });
    if (reason.trim().length < 5 || reason.trim().length > 500)
      throw new ValidationApiException({ field: "reason", reason: "LENGTH" });
    const proposed = this.normalizeSnapshot(input);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"feature-flag:" + key}))`;
      const current = await tx.featureFlag.findUnique({ where: { key } });
      if (creating && current) throw new ValidationApiException({ field: "key", reason: "ALREADY_EXISTS" });
      if (!creating && !current) throw new NotFoundApiException("FeatureFlag", { key });
      const currentVersion = current?.version ?? 0;
      if (baseVersion !== currentVersion) throw new SettingChangeConflictException({ key, currentVersion });
      const previous = current ? this.snapshot(current) : null;
      if (previous && JSON.stringify(previous) === JSON.stringify(proposed))
        throw new ValidationApiException({ field: "value", reason: "UNCHANGED", key });
      await tx.featureFlagChange.updateMany({
        where: { flagKey: key, status: FeatureFlagChangeStatus.PENDING },
        data: { status: FeatureFlagChangeStatus.SUPERSEDED, reviewedAt: new Date() },
      });
      const change = await tx.featureFlagChange.create({
        data: {
          flagKey: key,
          previousValue: previous ? (previous as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          proposedValue: proposed as unknown as Prisma.InputJsonValue,
          baseVersion,
          status: FeatureFlagChangeStatus.PENDING,
          reason: reason.trim(),
          requestedByAdminId: actor.adminUserId,
        },
      });
      await this.audit.record({
        adminUserId: actor.adminUserId,
        action: "feature_flag.change_proposed",
        entityType: "FeatureFlag",
        entityId: key,
        reason: reason.trim(),
        beforeSummary: previous ? this.auditSummary(previous) : { absent: true },
        afterSummary: { ...this.auditSummary(proposed), changeId: change.id },
        tx,
      });
      return change;
    });
    return this.toChangeDto(created.id);
  }

  private normalizeSnapshot(input: FlagInput): FeatureFlagSnapshot & { description?: string } {
    if (typeof input.isEnabled !== "boolean")
      throw new ValidationApiException({ field: "isEnabled", reason: "REQUIRED" });
    if (
      !Number.isInteger(input.rolloutPercentage) ||
      input.rolloutPercentage < 0 ||
      input.rolloutPercentage > 100
    )
      throw new ValidationApiException({ field: "rolloutPercentage", reason: "OUT_OF_RANGE" });
    const cities = this.normalizedUnique(input.cities, "cities", 50, 64);
    const betaUserIds = this.normalizedUnique(input.betaUserIds, "betaUserIds", 500, 36);
    if (
      betaUserIds.some(
        (id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      )
    )
      throw new ValidationApiException({ field: "betaUserIds", reason: "INVALID_UUID" });
    const description = input.description?.trim();
    if (description && description.length > 500)
      throw new ValidationApiException({ field: "description", reason: "TOO_LONG" });
    return {
      isEnabled: input.isEnabled,
      rolloutPercentage: input.rolloutPercentage,
      cities,
      betaUserIds,
      ...(description ? { description } : {}),
    };
  }

  private normalizedUnique(value: unknown, field: string, max: number, maxLength: number) {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
      throw new ValidationApiException({ field, reason: "INVALID_LIST" });
    const normalized = [...new Set(value.map((entry) => entry.trim()).filter(Boolean))];
    if (normalized.length > max || normalized.some((entry) => entry.length > maxLength))
      throw new ValidationApiException({ field, reason: "LIST_LIMIT" });
    return normalized;
  }

  private snapshot(flag: {
    description: string | null;
    isEnabled: boolean;
    rolloutPercentage: number;
    cities: string[];
    betaUserIds: string[];
  }) {
    return {
      ...(flag.description ? { description: flag.description } : {}),
      isEnabled: flag.isEnabled,
      rolloutPercentage: flag.rolloutPercentage,
      cities: flag.cities,
      betaUserIds: flag.betaUserIds,
    };
  }

  private readSnapshot(value: unknown) {
    return this.normalizeSnapshot(value as FlagInput);
  }

  private auditSummary(flag: FeatureFlagSnapshot & { description?: string }) {
    return {
      isEnabled: flag.isEnabled,
      rolloutPercentage: flag.rolloutPercentage,
      cities: flag.cities,
      betaUserCount: flag.betaUserIds.length,
      ...(flag.description ? { description: flag.description } : {}),
    };
  }

  private toFlagDto(flag: {
    key: string;
    description: string | null;
    isEnabled: boolean;
    rolloutPercentage: number;
    cities: string[];
    betaUserIds: string[];
    version: number;
    updatedAt: Date;
    createdAt: Date;
  }) {
    return {
      key: flag.key,
      description: flag.description,
      isEnabled: flag.isEnabled,
      rolloutPercentage: flag.rolloutPercentage,
      cities: flag.cities,
      betaUserIds: flag.betaUserIds,
      version: flag.version,
      updatedAt: flag.updatedAt.toISOString(),
      createdAt: flag.createdAt.toISOString(),
    };
  }

  private async toChangeDto(id: string) {
    const row = await this.prisma.featureFlagChange.findUniqueOrThrow({ where: { id } });
    return this.toChangeDtoRow(row);
  }

  private toChangeDtoRow(row: {
    id: string;
    flagKey: string;
    previousValue: Prisma.JsonValue | null;
    proposedValue: Prisma.JsonValue;
    baseVersion: number;
    status: FeatureFlagChangeStatus;
    reason: string;
    requestedByAdminId: string;
    reviewedByAdminId: string | null;
    reviewNote: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
  }) {
    return {
      id: row.id,
      key: row.flagKey,
      previousValue: row.previousValue,
      proposedValue: row.proposedValue,
      baseVersion: row.baseVersion,
      status: row.status,
      reason: row.reason,
      requestedByAdminId: row.requestedByAdminId,
      reviewedByAdminId: row.reviewedByAdminId,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    };
  }
}
