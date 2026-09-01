import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../../common/session/session.service";
import { RefundsService } from "./refunds.service";
import { CreateRefundDto } from "./dto/create-refund.dto";

/** Spec section 26 — consumer/dev refund initiation, owner-visible status only (see RefundsService doc comment). */
@Controller()
@UseGuards(SessionAuthGuard)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post("orders/:orderId/refunds")
  @UseInterceptors(IdempotencyInterceptor)
  create(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string, @Body() dto: CreateRefundDto) {
    return this.refunds.request(user.id, orderId, dto.reason, dto.amount);
  }

  @Get("orders/:orderId/refunds")
  list(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    return this.refunds.listForOrder(user.id, orderId);
  }

  @Get("refunds/:id")
  getById(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.refunds.getById(user.id, id);
  }
}
