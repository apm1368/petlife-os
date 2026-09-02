import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminFinanceService } from "./admin-finance.service";
import { AdminRefundService } from "./admin-refund.service";
import { RejectAdminRefundDto, RequestAdminRefundDto } from "./dto/admin-refund.dto";

@Controller("admin/transactions")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminFinanceController {
  constructor(
    private readonly finance: AdminFinanceService,
    private readonly refunds: AdminRefundService,
  ) {}

  @Get("orders/:orderId")
  @RequireAdminPermission("finance.view")
  getOrderFinancials(@Param("orderId") orderId: string) {
    return this.finance.getOrderFinancials(orderId);
  }

  @Post("refund-approvals")
  @RequireAdminPermission("finance.refund.request")
  @UseInterceptors(IdempotencyInterceptor)
  request(@Body() dto: RequestAdminRefundDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.refunds.request(admin, dto.orderId, dto.amount, dto.reason, dto.idempotencyKey, request.requestId);
  }

  @Get("refund-approvals/:id")
  @RequireAdminPermission("finance.view")
  get(@Param("id") id: string) {
    return this.refunds.get(id);
  }

  @Patch("refund-approvals/:id/approve")
  @RequireAdminPermission("finance.refund.approve")
  approve(@Param("id") id: string, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.refunds.approve(admin, id, request.requestId);
  }

  @Patch("refund-approvals/:id/reject")
  @RequireAdminPermission("finance.refund.approve")
  reject(@Param("id") id: string, @Body() dto: RejectAdminRefundDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.refunds.reject(admin, id, dto.reason, request.requestId);
  }

  @Patch("refund-approvals/:id/execute")
  @RequireAdminPermission("finance.refund.execute")
  execute(@Param("id") id: string, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.refunds.execute(admin, id, request.requestId);
  }
}
