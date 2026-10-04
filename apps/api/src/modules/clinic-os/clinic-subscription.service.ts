import { Injectable } from "@nestjs/common";
import { ClinicPlanStatus, SubscriptionChangeType, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { CLINIC_PLAN_INCLUDE, ClinicEntitlementService, toPlanDto, type ResolvedClinicPlan } from "./clinic-entitlement.service";
import type { AssignClinicPlanDto } from "./dto/clinic-os.dto";

@Injectable()
export class ClinicSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClinicEntitlementService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async catalog() {
    const plans = await this.prisma.clinicPlan.findMany({ where: { status: ClinicPlanStatus.ACTIVE }, include: CLINIC_PLAN_INCLUDE, orderBy: { sortOrder: "asc" } });
    return plans.map(toPlanDto);
  }

  async current(organizationId: string) {
    return this.toCurrentDto(await this.entitlements.resolve(organizationId), organizationId);
  }

  async adminGet(organizationId: string) {
    await this.assertOrganization(organizationId);
    const current = await this.current(organizationId);
    const history = await this.prisma.clinicSubscriptionChange.findMany({ where: { subscription: { providerOrganizationId: organizationId } }, orderBy: { createdAt: "desc" }, take: 50 });
    return { ...current, history: history.map((h) => ({ type: h.type, fromPlanCode: h.fromPlanCode, toPlanCode: h.toPlanCode, reason: h.reason, actorAdminUserId: h.actorAdminUserId, createdAt: h.createdAt.toISOString() })) };
  }

  /**
   * An admin assigns a plan (the only way onto GROWTH/PRO while clinic pricing and payments are not live).
   * Audited in the same transaction; the change history records the old and new plan.
   */
  async adminAssign(admin: ResolvedAdminContext, organizationId: string, dto: AssignClinicPlanDto) {
    await this.assertOrganization(organizationId);
    const periodEndsAt = dto.periodEndsAt ? new Date(dto.periodEndsAt) : null;
    if (periodEndsAt && periodEndsAt <= new Date()) throw new ValidationApiException({ periodEndsAt: "must be in the future" });
    const plan = await this.prisma.clinicPlan.findUnique({ where: { code: dto.planCode } });
    if (!plan || plan.status !== ClinicPlanStatus.ACTIVE) throw new NotFoundApiException("ClinicPlan");
    const before = await this.entitlements.resolve(organizationId);

    await this.prisma.$transaction(async (tx) => {
      const sub = await tx.clinicSubscription.update({ where: { providerOrganizationId: organizationId }, data: { planId: plan.id, status: SubscriptionStatus.ACTIVE, currentPeriodEndsAt: periodEndsAt } });
      const fromOrder = before.effectivePlan.sortOrder;
      const type = plan.sortOrder > fromOrder ? SubscriptionChangeType.UPGRADE : plan.sortOrder < fromOrder ? SubscriptionChangeType.DOWNGRADE_APPLIED : SubscriptionChangeType.RENEWED;
      await tx.clinicSubscriptionChange.create({ data: { subscriptionId: sub.id, type, fromPlanCode: before.effectivePlan.code, toPlanCode: plan.code, actorAdminUserId: admin.adminUserId, reason: dto.reason } });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "clinic_subscription.plan_assigned", entityType: "ClinicSubscription", entityId: sub.id, reason: dto.reason, beforeSummary: { planCode: before.effectivePlan.code }, afterSummary: { planCode: plan.code, periodEndsAt: periodEndsAt?.toISOString() ?? null, organizationId }, tx });
    });
    return this.adminGet(organizationId);
  }

  private async assertOrganization(organizationId: string) {
    const exists = await this.prisma.providerOrganization.count({ where: { id: organizationId } });
    if (!exists) throw new NotFoundApiException("ProviderOrganization");
  }

  private async toCurrentDto(resolved: ResolvedClinicPlan, organizationId: string) {
    const monthStart = startOfUtcMonth(new Date());
    const remindersThisMonth = await this.prisma.clinicReminder.count({ where: { providerOrganizationId: organizationId, createdAt: { gte: monthStart } } });
    return {
      status: resolved.status,
      plan: toPlanDto(resolved.effectivePlan),
      assignedPlanCode: resolved.assignedPlanCode,
      currentPeriodEndsAt: resolved.currentPeriodEndsAt?.toISOString() ?? null,
      usage: { remindersThisMonth },
    };
  }
}

export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
