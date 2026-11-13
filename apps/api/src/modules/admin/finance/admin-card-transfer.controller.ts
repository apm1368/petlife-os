import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { CardTransferPaymentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CardTransferPaymentService } from "../../commerce/payments/card-transfer-payment.service";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import { AdminCardTransferReceiptsService } from "./admin-card-transfer-receipts.service";
import { ReceiptReviewNotifier } from "./receipt-review.notifier";

class ReviewCardTransferDto {
  @IsInt() @Min(0) receivedAmount!: number;
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() @Length(2, 500) reason?: string;
}

class ListCardTransfersQueryDto {
  @IsOptional() @IsIn([...Object.values(CardTransferPaymentStatus), "ALL"]) status?: CardTransferPaymentStatus | "ALL";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

/** Review is an operations action, not a payment-method control (P1-b). Reading the queue needs finance.view. */
@Controller("admin/card-transfer-payments")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCardTransferController {
  constructor(
    private readonly payments: CardTransferPaymentService,
    private readonly audit: AdminAuditLogService,
    private readonly receipts: AdminCardTransferReceiptsService,
    private readonly notifier: ReceiptReviewNotifier,
  ) {}

  @Get()
  @RequireAdminPermission("finance.view")
  list(@Query() query: ListCardTransfersQueryDto) {
    return this.receipts.list({ status: query.status, page: query.page ?? 1, pageSize: query.pageSize ?? 20 });
  }

  @Get(":id")
  @RequireAdminPermission("finance.view")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.receipts.get(id);
  }

  @Post(":id/receipt-link")
  @RequireAdminPermission("finance.view")
  receiptLink(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Req() req: AdminAuthedRequest) {
    return this.receipts.receiptLink(admin, id, req.requestId);
  }

  @Post(":id/review")
  @RequireAdminPermission("finance.refund.execute")
  async review(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewCardTransferDto) {
    const before = await this.payments.review(admin.adminUserId, id, dto.receivedAmount, dto.approve, dto.reason);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "card_transfer.reviewed", entityType: "CardTransferPayment", entityId: id, reason: dto.reason, afterSummary: { status: before.status, receivedAmount: before.receivedAmount, approved: dto.approve } });
    await this.notifier.cardPaymentReviewed(before);
    return before;
  }
}
