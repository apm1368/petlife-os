import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CardTransferPaymentService } from "../../commerce/payments/card-transfer-payment.service";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";

class ReviewCardTransferDto {
  @IsInt() @Min(0) receivedAmount!: number;
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @Length(2, 500) reason?: string;
}

/** Review is an operations action, not a payment-method control (P1-b). */
@Controller("admin/card-transfer-payments")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCardTransferController {
  constructor(private readonly payments: CardTransferPaymentService, private readonly audit: AdminAuditLogService) {}

  @Post(":id/review")
  @RequireAdminPermission("finance.refund.execute")
  async review(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewCardTransferDto) {
    const before = await this.payments.review(admin.adminUserId, id, dto.receivedAmount, dto.approve, dto.reason);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "card_transfer.reviewed", entityType: "CardTransferPayment", entityId: id, reason: dto.reason, afterSummary: { status: before.status, receivedAmount: before.receivedAmount, approved: dto.approve } });
    return before;
  }
}
