import { Injectable } from "@nestjs/common";
import { Prisma, SubscriptionEntitlementType, SubscriptionPlanPriceStatus } from "@prisma/client";
import type { SubscriptionPlanDto, SubscriptionPlanPriceDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DuplicateSubscriptionPlanCodeException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { PLAN_INCLUDE, toPlanDto, toPlanPriceDto, type PlanWithRelations } from "../../subscriptions/subscription-mapper";
import { SubscriptionPlanReadService } from "../../subscriptions/subscription-plan-read.service";
import type { CreateAdminSubscriptionPlanDto, CreateAdminSubscriptionPlanPriceDto, UpdateAdminSubscriptionPlanDto, UpdateAdminSubscriptionPlanPriceStatusDto, UpsertAdminPlanEntitlementDto } from "./dto/admin-subscription-plan.dto";

/**
 * Admin writes for plan/price/entitlement definitions — the plain
 * `SubscriptionPlanReadService` (Handoff 16's own domain module) stays
 * read-only; this mirrors `AdminSellerSettlementService`'s own "admin
 * service imports the plain domain module, adds writes, never edits it in
 * place" shape. Historical subscriptions never break when a plan is later
 * hidden (spec) because `SubscriptionPlanStatus.HIDDEN`/`INACTIVE` only gate
 * *new* subscribability (`assertSubscribable`) — an existing
 * Subscription/SubscriptionPeriod row keeps its own `planId` FK regardless.
 */
@Injectable()
export class AdminSubscriptionPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: SubscriptionPlanReadService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  private async loadRaw(planId: string): Promise<PlanWithRelations> {
    return this.plans.getRawById(planId);
  }

  async list(): Promise<SubscriptionPlanDto[]> {
    const rows = await this.prisma.subscriptionPlan.findMany({ include: PLAN_INCLUDE, orderBy: { sortOrder: "asc" } });
    return rows.map(toPlanDto);
  }

  async get(planId: string): Promise<SubscriptionPlanDto> {
    return toPlanDto(await this.loadRaw(planId));
  }

  async create(admin: ResolvedAdminContext, dto: CreateAdminSubscriptionPlanDto): Promise<SubscriptionPlanDto> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const plan = await tx.subscriptionPlan.create({
          data: {
            code: dto.code,
            nameFa: dto.nameFa,
            nameEn: dto.nameEn,
            descriptionFa: dto.descriptionFa,
            descriptionEn: dto.descriptionEn,
            sortOrder: dto.sortOrder ?? 0,
            isFree: dto.isFree ?? false,
            trialDays: dto.trialDays,
            countryAvailability: { create: dto.countryAvailability.map((countryCode) => ({ countryCode })) },
          },
          include: PLAN_INCLUDE,
        });
        await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription_plan.created", entityType: "SubscriptionPlan", entityId: plan.id, afterSummary: { code: plan.code, isFree: plan.isFree }, tx });
        return plan;
      });
      return toPlanDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DuplicateSubscriptionPlanCodeException({ code: dto.code });
      throw error;
    }
  }

  async update(admin: ResolvedAdminContext, planId: string, dto: UpdateAdminSubscriptionPlanDto): Promise<SubscriptionPlanDto> {
    const existing = await this.loadRaw(planId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionPlan.update({
        where: { id: planId },
        data: {
          nameFa: dto.nameFa,
          nameEn: dto.nameEn,
          descriptionFa: dto.descriptionFa,
          descriptionEn: dto.descriptionEn,
          status: dto.status,
          sortOrder: dto.sortOrder,
          trialDays: dto.trialDays,
        },
      });
      if (dto.countryAvailability) {
        await tx.subscriptionPlanCountry.deleteMany({ where: { planId } });
        await tx.subscriptionPlanCountry.createMany({ data: dto.countryAvailability.map((countryCode) => ({ planId, countryCode })) });
      }
      await this.auditLog.record({
        adminUserId: admin.adminUserId,
        action: "subscription_plan.updated",
        entityType: "SubscriptionPlan",
        entityId: planId,
        beforeSummary: { status: existing.status, sortOrder: existing.sortOrder },
        afterSummary: { status: dto.status ?? existing.status, sortOrder: dto.sortOrder ?? existing.sortOrder },
        tx,
      });
      return tx.subscriptionPlan.findUniqueOrThrow({ where: { id: planId }, include: PLAN_INCLUDE });
    });
    return toPlanDto(updated);
  }

  /** Upsert-by-key — spec: "a LIMIT row with neither value set is rejected", enforced here since Prisma's DSL cannot express a conditional-required-column CHECK cleanly for two mutually exclusive optional fields. */
  async upsertEntitlement(admin: ResolvedAdminContext, planId: string, dto: UpsertAdminPlanEntitlementDto): Promise<SubscriptionPlanDto> {
    await this.loadRaw(planId);
    if (dto.type === SubscriptionEntitlementType.LIMIT && dto.limitValue === undefined) {
      throw new ValidationApiException({ field: "limitValue", reason: "A LIMIT entitlement must set limitValue (use null for unlimited)." });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionPlanEntitlement.upsert({
        where: { planId_key: { planId, key: dto.key } },
        create: { planId, key: dto.key, type: dto.type, boolValue: dto.boolValue ?? null, limitValue: dto.limitValue ?? null },
        update: { type: dto.type, boolValue: dto.boolValue ?? null, limitValue: dto.limitValue ?? null },
      });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription_plan.updated", entityType: "SubscriptionPlan", entityId: planId, afterSummary: { entitlementKey: dto.key }, tx });
      return tx.subscriptionPlan.findUniqueOrThrow({ where: { id: planId }, include: PLAN_INCLUDE });
    });
    return toPlanDto(updated);
  }

  /**
   * Prices are append-only history (see SubscriptionPlanPrice's own schema
   * doc comment) — creating a new ACTIVE price for the same
   * (plan, country, interval) flips the previous one to INACTIVE with
   * `effectiveTo` set, so a Subscription/SubscriptionPeriod created under
   * the old price keeps resolving its own real historical amount forever.
   */
  async createPrice(admin: ResolvedAdminContext, planId: string, dto: CreateAdminSubscriptionPlanPriceDto): Promise<SubscriptionPlanPriceDto> {
    await this.loadRaw(planId);
    const now = new Date();

    const price = await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionPlanPrice.updateMany({
        where: { planId, countryCode: dto.countryCode, billingInterval: dto.billingInterval, status: SubscriptionPlanPriceStatus.ACTIVE },
        data: { status: SubscriptionPlanPriceStatus.INACTIVE, effectiveTo: now },
      });
      const row = await tx.subscriptionPlanPrice.create({
        data: { planId, countryCode: dto.countryCode, billingInterval: dto.billingInterval, amount: dto.amount, effectiveFrom: now },
      });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription_plan_price.created", entityType: "SubscriptionPlanPrice", entityId: row.id, afterSummary: { planId, countryCode: dto.countryCode, billingInterval: dto.billingInterval, amount: dto.amount }, tx });
      return row;
    });
    return toPlanPriceDto(price);
  }

  async updatePriceStatus(admin: ResolvedAdminContext, priceId: string, dto: UpdateAdminSubscriptionPlanPriceStatusDto): Promise<SubscriptionPlanPriceDto> {
    const price = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscriptionPlanPrice.update({ where: { id: priceId }, data: { status: dto.status, effectiveTo: dto.status === SubscriptionPlanPriceStatus.INACTIVE ? new Date() : null } });
      await this.auditLog.record({ adminUserId: admin.adminUserId, action: "subscription_plan_price.updated", entityType: "SubscriptionPlanPrice", entityId: priceId, afterSummary: { status: dto.status }, tx });
      return row;
    });
    return toPlanPriceDto(price);
  }
}
