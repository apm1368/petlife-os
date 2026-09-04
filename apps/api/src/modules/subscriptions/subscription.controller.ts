import { Body, Controller, Get, Headers, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { SubscriptionBillingReason } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { HouseholdMemberGuard } from "../../common/auth/household-member.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../common/session/session.service";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionBillingService } from "./subscription-billing.service";
import { EntitlementService } from "./entitlement.service";
import { SubscriptionPlanReadService } from "./subscription-plan-read.service";
import { resolveHouseholdCountry } from "./household-country.util";
import { ScheduleDowngradeDto, StartTrialDto, SubscribeDto } from "./dto/subscription.dto";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Consumer subscription API (spec: "GET current subscription, GET
 * entitlements, GET usage, POST start trial, POST subscribe, POST upgrade,
 * POST schedule downgrade, POST cancel, POST resume cancellation, GET
 * billing history"), scoped to one household exactly like
 * `HouseholdPetsController`/`ActivePetController` already are —
 * `HouseholdMemberGuard` is the sole authorization boundary (spec: "verify
 * household ownership... no IDOR"). Every limit/price/country decision is
 * resolved server-side from the household's own row; nothing here accepts
 * a client-supplied amount, price, or entitlement value (spec: "no
 * client-controlled entitlement values, no client-controlled pricing").
 */
@Controller("households/:householdId/subscription")
@UseGuards(SessionAuthGuard, HouseholdMemberGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly billing: SubscriptionBillingService,
    private readonly entitlements: EntitlementService,
    private readonly plans: SubscriptionPlanReadService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getCurrent(@Param("householdId") householdId: string) {
    return this.subscriptions.getCurrent(householdId);
  }

  /** Plans comparison page — resolved by the household's own country (spec: "reuse CountryConfig... no client-controlled pricing"), never Free hidden among them (that's the frontend's job to render, this just returns every ACTIVE plan available in-country including FREE). */
  @Get("plans")
  getPlans(@Param("householdId") householdId: string) {
    return resolveHouseholdCountry(this.prisma, householdId).then((countryCode) => this.plans.listForCountry(countryCode));
  }

  @Get("entitlements")
  getEntitlements(@Param("householdId") householdId: string) {
    return this.entitlements.resolveAll(householdId);
  }

  @Get("usage")
  getUsage(@Param("householdId") householdId: string) {
    return this.entitlements.listUsage(householdId);
  }

  @Get("billing-history")
  getBillingHistory(@Param("householdId") householdId: string) {
    return this.subscriptions.getBillingHistory(householdId);
  }

  @Get("changes")
  async getChanges(@Param("householdId") householdId: string) {
    const sub = await this.subscriptions.getCurrent(householdId);
    return this.subscriptions.listChanges(sub.id);
  }

  @Post("trial")
  @UseInterceptors(IdempotencyInterceptor)
  startTrial(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser, @Body() dto: StartTrialDto) {
    return this.subscriptions.startTrial(householdId, dto.planId, user.id);
  }

  @Post("subscribe")
  @UseInterceptors(IdempotencyInterceptor)
  subscribe(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser, @Body() dto: SubscribeDto, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.billing.purchase(householdId, user.id, dto.planId, dto.billingInterval, SubscriptionBillingReason.INITIAL, idempotencyKey, dto.mode);
  }

  @Post("upgrade")
  @UseInterceptors(IdempotencyInterceptor)
  upgrade(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser, @Body() dto: SubscribeDto, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.billing.purchase(householdId, user.id, dto.planId, dto.billingInterval, SubscriptionBillingReason.UPGRADE, idempotencyKey, dto.mode);
  }

  @Post("downgrade")
  scheduleDowngrade(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser, @Body() dto: ScheduleDowngradeDto) {
    return this.subscriptions.scheduleDowngrade(householdId, dto.planId, user.id);
  }

  @Post("cancel")
  cancel(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser) {
    return this.subscriptions.cancelAtPeriodEnd(householdId, user.id);
  }

  @Post("resume")
  resume(@Param("householdId") householdId: string, @CurrentUser() user: SessionUser) {
    return this.subscriptions.resumeCancellation(householdId, user.id);
  }
}
