import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../../common/session/session.service";
import { OrdersService } from "./orders.service";
import { OrderLifecycleService } from "./order-lifecycle.service";
import { CancelOrderDto, CreateRefundRequestDto } from "./dto/order-actions.dto";
import { CreateRefundDto } from "../refunds/dto/create-refund.dto";

@Controller("orders")
@UseGuards(SessionAuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.orders.list(user.id);
  }

  @Get(":id")
  getById(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.getById(user.id, id);
  }

  @Post(":id/cancel")
  @UseInterceptors(IdempotencyInterceptor)
  cancel(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.lifecycle.cancel(user.id, id, dto.reason);
  }

  /** Legacy route — now cancel-before-dispatch only (see OrderLifecycleService.legacyRefund). */
  @Post(":id/refunds")
  @UseInterceptors(IdempotencyInterceptor)
  legacyRefund(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateRefundDto) {
    return this.lifecycle.legacyRefund(user.id, id, dto.reason, dto.amount);
  }

  @Post(":id/refund-requests")
  @UseInterceptors(IdempotencyInterceptor)
  createRefundRequest(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateRefundRequestDto) {
    return this.lifecycle.createRefundRequest(user.id, id, dto);
  }

  @Post(":id/refund-requests/:requestId/withdraw")
  withdrawRefundRequest(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Param("requestId", ParseUUIDPipe) requestId: string) {
    return this.lifecycle.withdrawRefundRequest(user.id, id, requestId);
  }
}
