import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { SellerOrderService } from "./seller-order.service";
import { SellerDashboardService } from "./seller-dashboard.service";
import { ListSellerOrdersQueryDto } from "./dto/seller-order.dto";

/** Unified seller Orders view (spec section 37-38, 52) — spans PET LIFE OS checkout Orders and marketplace-origin Orders. Read-only: mutations go through the existing order-logistics/refund endpoints. */
@Controller("seller-organizations/:sellerId/orders")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerOrderController {
  constructor(private readonly orders: SellerOrderService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: ListSellerOrdersQueryDto) {
    return this.orders.list(ctx, query);
  }

  @Get(":orderId")
  getById(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("orderId") orderId: string) {
    return this.orders.getById(ctx, orderId);
  }
}

@Controller("seller-organizations/:sellerId/dashboard")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerDashboardController {
  constructor(private readonly dashboard: SellerDashboardService) {}

  @Get()
  get(@CurrentSellerContext() ctx: ResolvedSellerContext) {
    return this.dashboard.getDashboard(ctx);
  }
}
