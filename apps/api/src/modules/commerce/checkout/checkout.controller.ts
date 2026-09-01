import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../../common/session/session.service";
import { CheckoutService } from "./checkout.service";
import {
  AuthorizeFinancingDto,
  CreateCheckoutDto,
  CreateFinancingIntentDto,
  CreatePaymentIntentDto,
  PayCheckoutDto,
  SelectFinancingPlanDto,
  UpdateCheckoutDto,
} from "./dto/checkout.dto";

@Controller("checkout")
@UseGuards(SessionAuthGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateCheckoutDto) {
    return this.checkout.create(user.id, dto);
  }

  @Get(":id")
  getById(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.checkout.getById(user.id, id);
  }

  @Post(":id/revalidate")
  revalidate(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.checkout.getById(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: UpdateCheckoutDto) {
    return this.checkout.update(user.id, id, dto);
  }

  @Post(":id/payment-intent")
  @UseInterceptors(IdempotencyInterceptor)
  createPaymentIntent(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: CreatePaymentIntentDto, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.checkout.createPaymentIntent(user.id, id, dto.provider, idempotencyKey);
  }

  @Post(":id/pay")
  @UseInterceptors(IdempotencyInterceptor)
  pay(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: PayCheckoutDto) {
    return this.checkout.pay(user.id, id, dto);
  }

  @Get(":id/payment-options")
  getPaymentOptions(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.checkout.getPaymentOptions(user.id, id);
  }

  @Post(":id/financing-intent")
  @UseInterceptors(IdempotencyInterceptor)
  createFinancingIntent(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: CreateFinancingIntentDto) {
    return this.checkout.createFinancingIntent(user.id, id, dto.provider);
  }

  @Get(":id/financing-intent/:financingId")
  getFinancingIntent(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("financingId") financingId: string) {
    return this.checkout.getFinancingIntent(user.id, id, financingId);
  }

  @Post(":id/financing-intent/:financingId/eligibility")
  checkFinancingEligibility(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("financingId") financingId: string) {
    return this.checkout.checkFinancingEligibility(user.id, id, financingId);
  }

  @Get(":id/financing-intent/:financingId/plans")
  getFinancingPlans(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("financingId") financingId: string) {
    return this.checkout.getFinancingPlans(user.id, id, financingId);
  }

  @Post(":id/financing-intent/:financingId/select-plan")
  selectFinancingPlan(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("financingId") financingId: string, @Body() dto: SelectFinancingPlanDto) {
    return this.checkout.selectFinancingPlan(user.id, id, financingId, dto.providerPlanId);
  }

  @Post(":id/financing-intent/:financingId/authorize")
  @UseInterceptors(IdempotencyInterceptor)
  authorizeFinancing(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("financingId") financingId: string, @Body() dto: AuthorizeFinancingDto) {
    return this.checkout.authorizeFinancing(user.id, id, financingId, dto.mode);
  }

  @Get(":id/ops")
  getOpsView(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.checkout.getOpsView(user.id, id);
  }
}
