import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../../common/session/session.service";
import { CheckoutService } from "./checkout.service";
import { CreateCheckoutDto, PayCheckoutDto, UpdateCheckoutDto } from "./dto/checkout.dto";

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
  createPaymentIntent(@CurrentUser() user: SessionUser, @Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.checkout.createPaymentIntent(user.id, id, idempotencyKey);
  }

  @Post(":id/pay")
  @UseInterceptors(IdempotencyInterceptor)
  pay(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: PayCheckoutDto) {
    return this.checkout.pay(user.id, id, dto);
  }
}
