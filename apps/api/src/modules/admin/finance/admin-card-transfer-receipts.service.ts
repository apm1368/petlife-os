import { Injectable } from "@nestjs/common";
import { CardTransferPaymentStatus, type Prisma } from "@prisma/client";
import type { AdminCardTransferPaymentDto, PaginatedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { StorageService } from "../../storage/storage.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const INCLUDE = {
  user: { select: { id: true, displayName: true } },
  checkout: { select: { id: true, orders: { select: { id: true }, take: 5 } } },
  booking: { select: { id: true } },
} satisfies Prisma.CardTransferPaymentInclude;

type Row = Prisma.CardTransferPaymentGetPayload<{ include: typeof INCLUDE }>;

export function toAdminCardTransferPaymentDto(row: Row): AdminCardTransferPaymentDto {
  return {
    id: row.id,
    status: row.status,
    member: { userId: row.user.id, displayName: row.user.displayName },
    reference: row.bookingId ? { kind: "BOOKING", bookingId: row.bookingId, orderIds: [] } : { kind: "ORDER", bookingId: null, orderIds: row.checkout?.orders.map((o) => o.id) ?? [] },
    expectedAmount: row.expectedAmount,
    receivedAmount: row.receivedAmount,
    currency: row.currency,
    companyCardNumberMasked: row.companyCardNumberMasked,
    accountHolderName: row.accountHolderName,
    receiptUploaded: !!row.receiptObjectKey,
    receiptUploadedAt: row.receiptUploadedAt?.toISOString() ?? null,
    reviewAvailableAt: row.reviewAvailableAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Card-to-card receipts for orders and bookings: the queue finance works through (review stays on the existing API). */
@Injectable()
export class AdminCardTransferReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditLogService,
  ) {}

  async list(query: { status?: CardTransferPaymentStatus | "ALL"; page: number; pageSize: number }): Promise<PaginatedDto<AdminCardTransferPaymentDto>> {
    // Pending first: the default view is the review queue, oldest receipt first.
    const status = query.status ?? CardTransferPaymentStatus.REVIEW_PENDING;
    const where: Prisma.CardTransferPaymentWhereInput = status === "ALL" ? {} : { status };
    const orderBy: Prisma.CardTransferPaymentOrderByWithRelationInput = status === CardTransferPaymentStatus.REVIEW_PENDING ? { receiptUploadedAt: "asc" } : { createdAt: "desc" };
    const [rows, total] = await Promise.all([
      this.prisma.cardTransferPayment.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: INCLUDE }),
      this.prisma.cardTransferPayment.count({ where }),
    ]);
    return { items: rows.map(toAdminCardTransferPaymentDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<AdminCardTransferPaymentDto> {
    const row = await this.prisma.cardTransferPayment.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new ValidationApiException({ field: "payment", reason: "NOT_FOUND" });
    return toAdminCardTransferPaymentDto(row);
  }

  /** A short-lived private link to the receipt image; opening it is audited (it shows a member's bank details). */
  async receiptLink(admin: ResolvedAdminContext, id: string, requestId?: string) {
    const row = await this.prisma.cardTransferPayment.findUnique({ where: { id }, select: { receiptObjectKey: true } });
    if (!row?.receiptObjectKey) throw new ValidationApiException({ field: "receipt", reason: "NOT_FOUND" });
    const target = await this.storage.createPrivateDownloadTarget(row.receiptObjectKey);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "card_transfer.receipt_viewed", entityType: "CardTransferPayment", entityId: id, requestId });
    return target;
  }
}
