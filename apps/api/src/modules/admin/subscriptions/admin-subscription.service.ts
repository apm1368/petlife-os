import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AdminSubscriptionDetailDto, AdminSubscriptionSummaryDto, PaginatedDto, SubscriptionBillingAttemptDto, SubscriptionEntitlementOverrideDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SubscriptionEntitlementOverrideNotFoundException, SubscriptionNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CHANGE_INCLUDE, SUBSCRIPTION_INCLUDE, toBillingAttemptDto, toChangeDto, toPlanRefDto, toSubscriptionDto } from "../../subscriptions/subscription-mapper";
import { SubscriptionService } from "../../subscriptions/subscription.service";
import { SubscriptionBillingService } from "../../subscriptions/subscription-billing.service";
import type { GrantEntitlementOverrideDto } from "./dto/admin-subscription-plan.dto";
import type { ListAdminBillingAttemptsQueryDto, ListAdminSubscriptionsQueryDto } from "./dto/admin-subscription.dto";

const OVERRIDE_INCLUDE = { createdByAdmin: { include: { user: true } } } as const;
type OverrideWithRelations = Prisma.SubscriptionEntitlementOverrideGetPayload<{ include: typeof OVERRIDE_INCLUDE }>;

function toOverrideDto(row: OverrideWithRelations): SubscriptionEntitlementOverrideDto {
  return {
    id: row.id,
    householdId: row.householdId,
    key: row.key,
    type: row.type as unknown as SubscriptionEntitlementOverrideDto["type"],
    boolValue: row.boolValue,
    limitValue: row.limitValue,
    reason: row.reason,
    createdByAdmin: { id: row.createdByAdmin.id, displayName: row.createdByAdmin.user.displayName ?? row.createdByAdmin.user.email ?? "Admin", role: row.createdByAdmin.role as unknown as SubscriptionEntitlementOverrideDto["createdByAdmin"]["role"] },
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Admin inspection + the two admin-only mutations the spec actually
 * enumerates: cancel a household's subscription, and grant/revoke a
 * controlled manual entitlement override (spec: "never silently modifying
 * plan definitions for one customer" — an override is its own row, the
 * plan itself is untouched). Refunding a billing attempt is exposed here
 * too, delegating entirely to `SubscriptionBillingService.refundBillingAttempt`
 * (H16's own refund policy: never auto-inferring a status change).
 */
@Injectable()
export class AdminSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly billing: SubscriptionBillingService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(query: ListAdminSubscriptionsQueryDto): Promise<PaginatedDto<AdminSubscriptionSummaryDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SubscriptionWhereInput = {
      status: query.status,
      household: query.q ? { name: { contains: query.q, mode: "insensitive" } } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.subscription.findMany({ where, include: { ...SUBSCRIPTION_INCLUDE, household: true }, orderBy: { updatedAt: "desc" }, skip, take }),
      this.prisma.subscription.count({ where }),
    ]);
    const items: AdminSubscriptionSummaryDto[] = rows.map((row) => ({
      id: row.id,
      household: { id: row.household.id, name: row.household.name },
      status: row.status as unknown as AdminSubscriptionSummaryDto["status"],
      plan: toPlanRefDto(row.plan),
      currentPeriodEndAt: row.currentPeriod ? row.currentPeriod.endAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    }));
    return toPaginatedDto(items, total, page, pageSize);
  }

  async getByHouseholdId(householdId: string): Promise<AdminSubscriptionDetailDto> {
    const row = await this.prisma.subscription.findUnique({ where: { householdId }, include: { ...SUBSCRIPTION_INCLUDE, household: true } });
    if (!row) throw new SubscriptionNotFoundException({ householdId });
    const [changes, billingAttempts] = await Promise.all([
      this.prisma.subscriptionChange.findMany({ where: { subscriptionId: row.id }, include: CHANGE_INCLUDE, orderBy: { createdAt: "desc" } }),
      this.prisma.subscriptionBillingAttempt.findMany({ where: { subscriptionId: row.id }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      ...toSubscriptionDto(row),
      household: { id: row.household.id, name: row.household.name },
      changes: changes.map(toChangeDto),
      billingAttempts: billingAttempts.map(toBillingAttemptDto),
    };
  }

  async listBillingAttempts(query: ListAdminBillingAttemptsQueryDto): Promise<PaginatedDto<SubscriptionBillingAttemptDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SubscriptionBillingAttemptWhereInput = query.householdId ? { subscription: { householdId: query.householdId } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.subscriptionBillingAttempt.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.subscriptionBillingAttempt.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toBillingAttemptDto), total, page, pageSize);
  }

  async cancel(admin: ResolvedAdminContext, householdId: string, reason: string | undefined) {
    const result = await this.subscriptions.adminCancel(householdId, admin.adminUserId, reason);
    await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription.admin_cancelled", entityType: "Subscription", entityId: result.id, reason });
    return result;
  }

  async refundBillingAttempt(admin: ResolvedAdminContext, billingAttemptId: string, reason: string): Promise<void> {
    await this.billing.refundBillingAttempt(billingAttemptId, reason, admin.adminUserId);
    await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription.billing_attempt_refunded", entityType: "SubscriptionBillingAttempt", entityId: billingAttemptId, reason });
  }

  async listOverrides(householdId: string): Promise<SubscriptionEntitlementOverrideDto[]> {
    const rows = await this.prisma.subscriptionEntitlementOverride.findMany({ where: { householdId }, include: OVERRIDE_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toOverrideDto);
  }

  /**
   * spec: "grant/revoke a controlled manual entitlement override... with
   * audit + expiry, never silently modifying plan definitions." Any
   * existing active override for the same (household, key) is deactivated
   * first so `EntitlementService`'s own resolution (which reads *the*
   * active override for a key) never has two active rows to arbitrate
   * between.
   */
  async grantOverride(admin: ResolvedAdminContext, dto: GrantEntitlementOverrideDto): Promise<SubscriptionEntitlementOverrideDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionEntitlementOverride.updateMany({ where: { householdId: dto.householdId, key: dto.key, active: true }, data: { active: false } });
      const created = await tx.subscriptionEntitlementOverride.create({
        data: {
          householdId: dto.householdId,
          key: dto.key,
          type: dto.type,
          boolValue: dto.boolValue ?? null,
          limitValue: dto.limitValue ?? null,
          reason: dto.reason,
          createdByAdminId: admin.adminUserId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        include: OVERRIDE_INCLUDE,
      });
      const sub = await this.subscriptions.getOrCreateRaw(dto.householdId, tx);
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: "ENTITLEMENT_OVERRIDE_GRANTED", note: `${dto.key}: ${dto.reason}`, initiatedByAdminId: admin.adminUserId } });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription_entitlement_override.granted", entityType: "SubscriptionEntitlementOverride", entityId: created.id, afterSummary: { householdId: dto.householdId, key: dto.key }, reason: dto.reason, tx });
      return created;
    });
    return toOverrideDto(row);
  }

  async revokeOverride(admin: ResolvedAdminContext, overrideId: string): Promise<void> {
    const existing = await this.prisma.subscriptionEntitlementOverride.findUnique({ where: { id: overrideId } });
    if (!existing) throw new SubscriptionEntitlementOverrideNotFoundException({ overrideId });

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionEntitlementOverride.update({ where: { id: overrideId }, data: { active: false } });
      const sub = await this.subscriptions.getOrCreateRaw(existing.householdId, tx);
      await tx.subscriptionChange.create({ data: { subscriptionId: sub.id, type: "ENTITLEMENT_OVERRIDE_REVOKED", note: existing.key, initiatedByAdminId: admin.adminUserId } });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription_entitlement_override.revoked", entityType: "SubscriptionEntitlementOverride", entityId: overrideId, tx });
    });
  }
}
