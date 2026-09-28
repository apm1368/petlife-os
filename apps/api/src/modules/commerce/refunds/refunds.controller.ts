import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { RefundsService } from "./refunds.service";

/** Owner-visible refund status. Customer refund initiation moved to OrdersController (Batch 4 policy). */
@Controller()
@UseGuards(SessionAuthGuard)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get("orders/:orderId/refunds")
  list(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    return this.refunds.listForOrder(user.id, orderId);
  }

  @Get("refunds/:id")
  getById(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.refunds.getById(user.id, id);
  }
}
