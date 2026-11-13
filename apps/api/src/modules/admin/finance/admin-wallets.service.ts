import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LedgerAccountCode, Prisma, WalletAdjustmentDirection, WalletBalanceType, WalletCreditSource, WalletTopUpStatus, type WalletAdjustment, type WalletTopUp } from "@prisma/client";
import type {
  AdminWalletAdjustmentDto,
  AdminWalletDetailDto,
  AdminWalletListItemDto,
  AdminWalletTopUpDto,
  PaginatedDto,
  WalletAdjustmentReasonCode,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { maskEmail } from "../../../common/pii/pii-mask.util";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { WalletService, WALLET_ADJUSTMENT_REFERENCE, toBalancesDto } from "../../commerce/payments/wallet.service";
import { WalletTopUpService, toTopUpDto } from "../../commerce/payments/wallet-top-up.service";
import { deriveWalletBalances } from "../../commerce/payments/payment-infrastructure.policy";
import { WALLET_ADJUSTMENT_MAX_IRR } from "../../commerce/payments/wallet-top-up.policy";
import { ReceiptReviewNotifier } from "./receipt-review.notifier";

export const WALLET_ADJUSTMENT_REASON_CODES: WalletAdjustmentReasonCode[] = [
  "GOODWILL",
  "SERVICE_RECOVERY",
  "PAYMENT_CORRECTION",
  "REFUND_OUTSIDE_SYSTEM",
  "DUPLICATE_CREDIT_REVERSAL",
  "OTHER",
];

type TopUpWithPeople = WalletTopUp & { user: { displayName: string }; reviewedByAdmin: { user: { displayName: string } } | null };
type AdjustmentWithAdmin = WalletAdjustment & { createdByAdmin: { id: string; user: { displayName: string } } };

function toAdminTopUpDto(row: TopUpWithPeople): AdminWalletTopUpDto {
  return {
    ...toTopUpDto(row),
    userId: row.userId,
    userDisplayName: row.user.displayName,
    cardNumberMasked: row.cardNumberMasked,
    receiptUploadedAt: row.receiptUploadedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedByAdmin?.user.displayName ?? null,
    failureCode: row.failureCode,
  };
}

function toAdjustmentDto(row: AdjustmentWithAdmin): AdminWalletAdjustmentDto {
  return {
    id: row.id,
    direction: row.direction,
    balanceType: row.balanceType,
    amount: row.amount,
    reasonCode: row.reasonCode,
    reason: row.reason,
    evidenceReference: row.evidenceReference,
    createdBy: { adminUserId: row.createdByAdmin.id, displayName: row.createdByAdmin.user.displayName },
    createdAt: row.createdAt.toISOString(),
  };
}

const TOP_UP_INCLUDE = { user: { select: { displayName: true } }, reviewedByAdmin: { select: { user: { select: { displayName: true } } } } } as const;
const ADJUSTMENT_INCLUDE = { createdByAdmin: { select: { id: true, user: { select: { displayName: true } } } } } as const;

/**
 * Finance's view of member wallets. Reading is wallet.view; every money movement (a correction, crediting a
 * receipt) needs its own permission, a reason, and writes its audit row in the same transaction as the money.
 * Contacts are masked here — revealing them stays with the customer screens and customer.pii.reveal.
 */
@Injectable()
export class AdminWalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly topUps: WalletTopUpService,
    private readonly audit: AdminAuditLogService,
    private readonly notifier: ReceiptReviewNotifier,
  ) {}

  async list(query: { q?: string; page: number; pageSize: number }): Promise<PaginatedDto<AdminWalletListItemDto>> {
    const q = query.q?.trim();
    const skip = (query.page - 1) * query.pageSize;
    if (q) {
      // Search reaches every member, wallet or not: every member has a wallet, it just starts empty.
      const where: Prisma.UserWhereInput = { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] };
      const [users, total] = await Promise.all([
        this.prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: query.pageSize, select: { id: true, displayName: true, email: true, phone: true } }),
        this.prisma.user.count({ where }),
      ]);
      return { items: await this.withBalances(users), total, page: query.page, pageSize: query.pageSize };
    }
    // Without a search: wallets that have money movements, most recently active first.
    const [accounts, total] = await Promise.all([
      this.prisma.$queryRaw<{ userId: string }[]>`
        SELECT a."userId" FROM wallet_accounts a
        JOIN wallet_entries e ON e."walletAccountId" = a.id
        GROUP BY a."userId" ORDER BY max(e."createdAt") DESC
        OFFSET ${skip} LIMIT ${query.pageSize}`,
      this.prisma.walletAccount.count({ where: { entries: { some: {} } } }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: accounts.map((a) => a.userId) } }, select: { id: true, displayName: true, email: true, phone: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    const ordered = accounts.map((a) => byId.get(a.userId)).filter((u): u is NonNullable<typeof u> => !!u);
    return { items: await this.withBalances(ordered), total, page: query.page, pageSize: query.pageSize };
  }

  private async withBalances(users: { id: string; displayName: string; email: string | null; phone: string | null }[]): Promise<AdminWalletListItemDto[]> {
    const accounts = await this.prisma.walletAccount.findMany({ where: { userId: { in: users.map((u) => u.id) } }, include: { entries: true } });
    const byUser = new Map(accounts.map((a) => [a.userId, a]));
    const now = new Date();
    return users.map((u) => {
      const account = byUser.get(u.id);
      const entries = account?.entries ?? [];
      const last = entries.reduce<Date | null>((max, e) => (!max || e.createdAt > max ? e.createdAt : max), null);
      return {
        userId: u.id,
        displayName: u.displayName,
        email: u.email ? maskEmail(u.email) : null,
        phone: u.phone ? maskPhone(u.phone) : null,
        balances: toBalancesDto(deriveWalletBalances(entries, now), account?.currency ?? "IRR"),
        lastActivityAt: last?.toISOString() ?? null,
      };
    });
  }

  async detail(userId: string): Promise<AdminWalletDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, email: true, phone: true, createdAt: true } });
    if (!user) throw new ValidationApiException({ field: "userId", reason: "NOT_FOUND" });
    const account = await this.prisma.walletAccount.findUnique({ where: { userId } });
    const [entries, topUps, adjustments] = await Promise.all([
      account ? this.prisma.walletEntry.findMany({ where: { walletAccountId: account.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }) : [],
      this.prisma.walletTopUp.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50, include: TOP_UP_INCLUDE }),
      account ? this.prisma.walletAdjustment.findMany({ where: { walletAccountId: account.id }, orderBy: { createdAt: "desc" }, take: 50, include: ADJUSTMENT_INCLUDE }) : [],
    ]);
    const entityIds = [...topUps.map((t) => t.id), ...adjustments.map((a) => a.id), ...(account ? [account.id] : [])];
    const audit = entityIds.length
      ? await this.prisma.adminAuditLog.findMany({ where: { entityId: { in: entityIds }, entityType: { in: ["WalletTopUp", "WalletAdjustment", "WalletAccount"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { adminUser: { select: { user: { select: { displayName: true } } } } } })
      : [];
    const allEntries = account ? await this.prisma.walletEntry.findMany({ where: { walletAccountId: account.id } }) : [];
    return {
      user: { id: user.id, displayName: user.displayName, email: user.email ? maskEmail(user.email) : null, phone: user.phone ? maskPhone(user.phone) : null, createdAt: user.createdAt.toISOString() },
      balances: toBalancesDto(deriveWalletBalances(allEntries), account?.currency ?? "IRR"),
      entries: await this.wallet.toEntryDtos(entries),
      topUps: topUps.map(toAdminTopUpDto),
      adjustments: adjustments.map(toAdjustmentDto),
      audit: audit.map((a) => ({ id: a.id, action: a.action, reason: a.reason, adminDisplayName: a.adminUser.user.displayName, createdAt: a.createdAt.toISOString() })),
    };
  }

  async adjust(
    admin: ResolvedAdminContext,
    userId: string,
    input: { direction: WalletAdjustmentDirection; balanceType: WalletBalanceType; amount: number; reasonCode: WalletAdjustmentReasonCode; reason: string; evidenceReference?: string },
    idempotencyKey: string | undefined,
    requestId?: string,
  ): Promise<AdminWalletAdjustmentDto> {
    const key = idempotencyKey?.trim() || null;
    if (key) {
      const replay = await this.prisma.walletAdjustment.findUnique({ where: { idempotencyKey: key }, include: { ...ADJUSTMENT_INCLUDE, walletAccount: true } });
      if (replay) {
        if (replay.walletAccount.userId !== userId) throw new ValidationApiException({ field: "idempotencyKey", reason: "CONFLICT" });
        return toAdjustmentDto(replay);
      }
    }
    const reason = input.reason.trim();
    if (reason.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    if (!WALLET_ADJUSTMENT_REASON_CODES.includes(input.reasonCode)) throw new ValidationApiException({ field: "reasonCode", reason: "UNKNOWN" });
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > WALLET_ADJUSTMENT_MAX_IRR) throw new ValidationApiException({ field: "amount", reason: "OUT_OF_RANGE", max: WALLET_ADJUSTMENT_MAX_IRR });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new ValidationApiException({ field: "userId", reason: "NOT_FOUND" });

    const row = await this.prisma.$transaction(async (tx) => {
      const account = await this.wallet.lockAccount(userId, tx);
      const before = deriveWalletBalances(await tx.walletEntry.findMany({ where: { walletAccountId: account.id } }));
      const adjustmentId = randomUUID();
      const entry = input.direction === WalletAdjustmentDirection.CREDIT
        ? await this.wallet.creditEntry({ userId, balanceType: input.balanceType, amount: input.amount, source: WalletCreditSource.MANUAL_CORRECTION, referenceType: WALLET_ADJUSTMENT_REFERENCE, referenceId: adjustmentId, debitAccount: LedgerAccountCode.WALLET_ADJUSTMENT }, tx)
        : await this.wallet.debitForAdjustment({ walletAccountId: account.id, balanceType: input.balanceType, amount: input.amount, referenceId: adjustmentId }, tx);
      const created = await tx.walletAdjustment.create({
        data: {
          id: adjustmentId, walletAccountId: account.id, direction: input.direction, balanceType: input.balanceType, amount: input.amount,
          reasonCode: input.reasonCode, reason, evidenceReference: input.evidenceReference?.trim() || null, idempotencyKey: key,
          walletEntryId: entry.entryId, createdByAdminId: admin.adminUserId,
        },
        include: ADJUSTMENT_INCLUDE,
      });
      const after = deriveWalletBalances(await tx.walletEntry.findMany({ where: { walletAccountId: account.id } }));
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: input.direction === WalletAdjustmentDirection.CREDIT ? "wallet.credited" : "wallet.debited",
        entityType: "WalletAdjustment",
        entityId: created.id,
        reason,
        beforeSummary: { userId, balances: before },
        afterSummary: { userId, balances: after, direction: input.direction, balanceType: input.balanceType, amount: input.amount, reasonCode: input.reasonCode, evidenceReference: created.evidenceReference },
        requestId,
        tx,
      });
      return created;
    });
    return toAdjustmentDto(row);
  }

  async listTopUps(query: { status?: WalletTopUpStatus; page: number; pageSize: number }): Promise<PaginatedDto<AdminWalletTopUpDto>> {
    await this.topUps.expireOverdue();
    const where: Prisma.WalletTopUpWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.walletTopUp.findMany({ where, orderBy: query.status === WalletTopUpStatus.REVIEW_PENDING ? { receiptUploadedAt: "asc" } : { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: TOP_UP_INCLUDE }),
      this.prisma.walletTopUp.count({ where }),
    ]);
    return { items: rows.map(toAdminTopUpDto), total, page: query.page, pageSize: query.pageSize };
  }

  async reviewTopUp(admin: ResolvedAdminContext, id: string, input: { approve: boolean; receivedAmount?: number; reason?: string }, requestId?: string): Promise<AdminWalletTopUpDto> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.walletTopUp.findUnique({ where: { id } });
      const reviewed = await this.topUps.review(tx, admin.adminUserId, id, input);
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: input.approve ? "wallet_top_up.approved" : "wallet_top_up.rejected",
        entityType: "WalletTopUp",
        entityId: id,
        reason: input.reason?.trim() || undefined,
        beforeSummary: { status: before?.status, amount: before?.amount },
        afterSummary: { status: reviewed.status, receivedAmount: reviewed.receivedAmount, userId: reviewed.userId },
        requestId,
        tx,
      });
    });
    const row = await this.prisma.walletTopUp.findUniqueOrThrow({ where: { id }, include: TOP_UP_INCLUDE });
    await this.notifier.topUpReviewed(row);
    return toAdminTopUpDto(row);
  }

  /** Looking at a bank receipt is itself recorded: it shows a member's card and bank details. */
  async receiptLink(admin: ResolvedAdminContext, id: string, requestId?: string) {
    const target = await this.topUps.receiptDownload(id);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "wallet_top_up.receipt_viewed", entityType: "WalletTopUp", entityId: id, requestId });
    return target;
  }
}
