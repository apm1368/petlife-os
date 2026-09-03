import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminSubscriptionPlanService } from "./admin-subscription-plan.service";
import { AdminSubscriptionService } from "./admin-subscription.service";
import {
  CreateAdminSubscriptionPlanDto,
  CreateAdminSubscriptionPlanPriceDto,
  GrantEntitlementOverrideDto,
  UpdateAdminSubscriptionPlanDto,
  UpdateAdminSubscriptionPlanPriceStatusDto,
  UpsertAdminPlanEntitlementDto,
} from "./dto/admin-subscription-plan.dto";
import { AdminCancelSubscriptionDto, ListAdminBillingAttemptsQueryDto, ListAdminSubscriptionsQueryDto, RefundBillingAttemptDto } from "./dto/admin-subscription.dto";

@Controller("admin/subscriptions")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSubscriptionController {
  constructor(
    private readonly plans: AdminSubscriptionPlanService,
    private readonly subscriptions: AdminSubscriptionService,
  ) {}

  // -- Plans ------------------------------------------------------------

  @Get("plans")
  @RequireAdminPermission("subscription.view")
  listPlans() {
    return this.plans.list();
  }

  @Get("plans/:planId")
  @RequireAdminPermission("subscription.view")
  getPlan(@Param("planId") planId: string) {
    return this.plans.get(planId);
  }

  @Post("plans")
  @RequireAdminPermission("subscription.plan.manage")
  createPlan(@Body() dto: CreateAdminSubscriptionPlanDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.plans.create(admin, dto);
  }

  @Patch("plans/:planId")
  @RequireAdminPermission("subscription.plan.manage")
  updatePlan(@Param("planId") planId: string, @Body() dto: UpdateAdminSubscriptionPlanDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.plans.update(admin, planId, dto);
  }

  @Post("plans/:planId/entitlements")
  @RequireAdminPermission("subscription.plan.manage")
  upsertEntitlement(@Param("planId") planId: string, @Body() dto: UpsertAdminPlanEntitlementDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.plans.upsertEntitlement(admin, planId, dto);
  }

  @Post("plans/:planId/prices")
  @RequireAdminPermission("subscription.plan.manage")
  createPrice(@Param("planId") planId: string, @Body() dto: CreateAdminSubscriptionPlanPriceDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.plans.createPrice(admin, planId, dto);
  }

  @Patch("prices/:priceId")
  @RequireAdminPermission("subscription.plan.manage")
  updatePriceStatus(@Param("priceId") priceId: string, @Body() dto: UpdateAdminSubscriptionPlanPriceStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.plans.updatePriceStatus(admin, priceId, dto);
  }

  // -- Household subscriptions -------------------------------------------

  @Get("households")
  @RequireAdminPermission("subscription.view")
  listHouseholdSubscriptions(@Query() query: ListAdminSubscriptionsQueryDto) {
    return this.subscriptions.list(query);
  }

  @Get("households/:householdId")
  @RequireAdminPermission("subscription.view")
  getHouseholdSubscription(@Param("householdId") householdId: string) {
    return this.subscriptions.getByHouseholdId(householdId);
  }

  @Post("households/:householdId/cancel")
  @RequireAdminPermission("subscription.manage")
  cancel(@Param("householdId") householdId: string, @Body() dto: AdminCancelSubscriptionDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.subscriptions.cancel(admin, householdId, dto.reason);
  }

  // -- Billing attempts ---------------------------------------------------

  @Get("billing-attempts")
  @RequireAdminPermission("subscription.view")
  listBillingAttempts(@Query() query: ListAdminBillingAttemptsQueryDto) {
    return this.subscriptions.listBillingAttempts(query);
  }

  @Post("billing-attempts/:billingAttemptId/refund")
  @RequireAdminPermission("subscription.manage")
  refundBillingAttempt(@Param("billingAttemptId") billingAttemptId: string, @Body() dto: RefundBillingAttemptDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.subscriptions.refundBillingAttempt(admin, billingAttemptId, dto.reason);
  }

  // -- Entitlement overrides ------------------------------------------------

  @Get("households/:householdId/entitlement-overrides")
  @RequireAdminPermission("subscription.view")
  listOverrides(@Param("householdId") householdId: string) {
    return this.subscriptions.listOverrides(householdId);
  }

  @Post("entitlement-overrides")
  @RequireAdminPermission("subscription.entitlement.override")
  grantOverride(@Body() dto: GrantEntitlementOverrideDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.subscriptions.grantOverride(admin, dto);
  }

  @Delete("entitlement-overrides/:overrideId")
  @RequireAdminPermission("subscription.entitlement.override")
  revokeOverride(@Param("overrideId") overrideId: string, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.subscriptions.revokeOverride(admin, overrideId);
  }
}
