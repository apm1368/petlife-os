import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { OrdersService } from "./orders.service";

@Controller("orders")
@UseGuards(SessionAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.orders.list(user.id);
  }

  @Get(":id")
  getById(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.orders.getById(user.id, id);
  }
}
