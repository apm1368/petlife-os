import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  LedgerAccountCode,
  Prisma,
  WalletAdjustmentDirection,
  WalletAdjustmentRequestStatus,
  WalletBalanceType,
  WalletCreditSource,
  WalletOwnerType,
  WalletTopUpStatus,
  type WalletTopUp,
} from "@prisma/client";
import type {
  AdminWalletAdjustmentDto,
  AdminWalletAdjustmentRequestDto,
  AdminWalletDetailDto,
  AdminWalletListItemDto,
  AdminWalletTopUpDto,
  PaginatedDto,
  WalletAdjustmentReasonCode,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  InvalidWalletAdjustmentRequestTransitionException,
  ValidationApiException,
  WalletAdjustmentRequestExpiredException,
  WalletAdjustmentRequestNotFoundException,
  WalletAdjustmentSelfApprovalException,
} from "../../../common/errors/api-exception";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { maskEmail } from "../../../common/pii/pii-mask.util";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { WalletService, WALLET_ADJUSTMENT_REFERENCE, toBalancesDto } from "../../commerce/payments/wallet.service";
import { WalletTopUpService, toTopUpDto } from "../../commerce/payments/wallet-top-up.service";
import { deriveWalletBalances } from "../../commerce/payments/payment-infrastructure.policy";
import { WALLET_ADJUSTMENT_MAX_IRR } from "../../commerce/payments/wallet-top-up.policy";
import { ReceiptReviewNotifier } from "./receipt-review.notifier";
import { WALLET_OWNER_SELECT, toWalletOwnerDto, type WalletAccountWithOwner } from "../../commerce/payments/wallet-owner";

export const WALLET_ADJUSTMENT_REASON_CODES: WalletAdjustmentReasonCode[] = [
  "GOODWILL",
  "SERVICE_RECOVERY",
  "PAYMENT_CORRECTION",
  "REFUND_OUTSIDE_SYSTEM",
  "DUPLICATE_CREDIT_REVERSAL",
  "OTHER",
];

/** FE-16: how long a correction request waits for a second admin before it lapses. */
export const WALLET_ADJUSTMENT_REQUEST_TTL_MS = 72 * 60 * 60 * 1000;
/** FE-16: open (pending, unexpired) correction requests one member may have at a time. */
export const WALLET_ADJUSTMENT_PENDING_CAP = 20;

const ADMIN_NAME = { select: { id: true, user: { select: { displayName: true } } } } as const;
const TOP_UP_INCLUDE = { user: { select: { displayName: true } }, reviewedByAdmin: { select: { user: { select: { displayName: true } } } }, walletAccount: { select: WALLET_OWNER_SELECT } } as const;
const ADJUSTMENT_INCLUDE = { createdByAdmin: ADMIN_NAME, request: { select: { decidedByAdmin: ADMIN_NAME } } } as const;
const REQUEST_INCLUDE = { user: { select: { displayName: true } }, requestedByAdmin: ADMIN_NAME, decidedByAdmin: ADMIN_NAME } as const;

type TopUpWithPeople = WalletTopUp & { user: { displayName: string }; reviewedByAdmin: { user: { displayName: string } } | null; walletAccount: WalletAccountWithOwner | null };
type AdjustmentWithAdmin = Prisma.WalletAdjustmentGetPayload<{ include: typeof ADJUSTMENT_INCLUDE }>;
type RequestWithPeople = Prisma.WalletAdjustmentRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;
type AdjustmentRequestInput = { direction: WalletAdjustmentDirection; balanceType: WalletBalanceType; amount: number; reasonCode: WalletAdjustmentReasonCode; reason: string; evidenceReference?: string };

function toAdminTopUpDto(row: TopUpWithPeople): AdminWalletTopUpDto {
  return {
    ...toTopUpDto(row),
    userId: row.userId,
    userDisplayName: row.user.displayName,
    businessWallet: row.walletAccount ? toWalletOwnerDto(row.walletAccount) : null,
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
    approvedBy: row.request?.decidedByAdmin ? { adminUserId: row.request.decidedByAdmin.id, displayName: row.request.decidedByAdmin.user.displayName } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRequestDto(row: RequestWithPeople): AdminWalletAdjustmentRequestDto {
  return {
    id: row.id,
    userId: row.userId,
    userDisplayName: row.user.displayName,
    direction: row.direction,
    balanceType: row.balanceType,
    amount: row.amountIrr,
    reasonCode: row.reasonCode as WalletAdjustmentReasonCode,
    reason: row.note,
    evidenceReference: row.evidenceReference,
    status: row.status,
    requestedBy: { adminUserId: row.requestedByAdmin.id, displayName: row.requestedByAdmin.user.displayName },
    decidedBy: row.decidedByAdmin ? { adminUserId: row.decidedByAdmin.id, displayName: row.decidedByAdmin.user.displayName } : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
    walletAdjustmentId: row.walletAdjustmentId,
    walletEntryId: row.walletEntryId,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Finance's view of member wallets. Reading is wallet.view; every money movement (a correction, crediting a
 * receipt) needs its own permission, a reason, and writes its audit row in the same transaction as the money.
 * A correction takes two people (FE-16): one admin requests it, a different admin with wallet.adjust approves it,
 * and only the approval posts the money.
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
        WHERE a."userId" IS NOT NULL
        GROUP BY a."userId" ORDER BY max(e."createdAt") DESC
        OFFSET ${skip} LIMIT ${query.pageSize}`,
      this.prisma.walletAccount.count({ where: { ownerType: WalletOwnerType.MEMBER, entries: { some: {} } } }),
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
    await this.expireOverdueAdjustmentRequests();
    const [entries, topUps, adjustments, requests] = await Promise.all([
      account ? this.prisma.walletEntry.findMany({ where: { walletAccountId: account.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }) : [],
      // The member's own wallet only: business top-ups they started show on that organisation's wallet.
      this.prisma.walletTopUp.findMany({ where: { userId, walletAccountId: null }, orderBy: { createdAt: "desc" }, take: 50, include: TOP_UP_INCLUDE }),
      account ? this.prisma.walletAdjustment.findMany({ where: { walletAccountId: account.id }, orderBy: { createdAt: "desc" }, take: 50, include: ADJUSTMENT_INCLUDE }) : [],
      // Open requests first (PENDING is the enum's first value), then the most recent decisions.
      this.prisma.walletAdjustmentRequest.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 50, include: REQUEST_INCLUDE }),
    ]);
    const entityIds = [...topUps.map((t) => t.id), ...adjustments.map((a) => a.id), ...requests.map((r) => r.id), ...(account ? [account.id] : [])];
    const audit = entityIds.length
      ? await this.prisma.adminAuditLog.findMany({ where: { entityId: { in: entityIds }, entityType: { in: ["WalletTopUp", "WalletAdjustment", "WalletAdjustmentRequest", "WalletAccount"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { adminUser: { select: { user: { select: { displayName: true } } } } } })
      : [];
    const allEntries = account ? await this.prisma.walletEntry.findMany({ where: { walletAccountId: account.id } }) : [];
    return {
      user: { id: user.id, displayName: user.displayName, email: user.email ? maskEmail(user.email) : null, phone: user.phone ? maskPhone(user.phone) : null, createdAt: user.createdAt.toISOString() },
      balances: toBalancesDto(deriveWalletBalances(allEntries), account?.currency ?? "IRR"),
      entries: await this.wallet.toEntryDtos(entries),
      topUps: topUps.map(toAdminTopUpDto),
      adjustments: adjustments.map(toAdjustmentDto),
      adjustmentRequests: requests.map(toRequestDto),
      audit: audit.map((a) => ({ id: a.id, action: a.action, reason: a.reason, adminDisplayName: a.adminUser.user.displayName, createdAt: a.createdAt.toISOString() })),
    };
  }

  /**
   * FE-16, step one: ask for a correction. Validated as a correction always was (reason, amount range, and a debit
   * no larger than what the bucket holds right now), but no money moves: the request waits for a different admin.
   * The member's wallet row is locked while the request is written, so the open-request cap and the balance check
   * hold when two requests arrive together.
   */
  async requestAdjustment(
    admin: ResolvedAdminContext,
    userId: string,
    input: AdjustmentRequestInput,
    idempotencyKey: string | undefined,
    requestId?: string,
  ): Promise<AdminWalletAdjustmentRequestDto> {
    const key = idempotencyKey?.trim() || null;
    if (key) {
      const replay = await this.replayRequest(key, userId);
      if (replay) return replay;
    }
    const reason = input.reason.trim();
    if (reason.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    if (!WALLET_ADJUSTMENT_REASON_CODES.includes(input.reasonCode)) throw new ValidationApiException({ field: "reasonCode", reason: "UNKNOWN" });
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > WALLET_ADJUSTMENT_MAX_IRR) throw new ValidationApiException({ field: "amount", reason: "OUT_OF_RANGE", max: WALLET_ADJUSTMENT_MAX_IRR });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new ValidationApiException({ field: "userId", reason: "NOT_FOUND" });

    const now = new Date();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const account = await this.wallet.lockAccount(userId, tx);
        const open = await tx.walletAdjustmentRequest.count({ where: { userId, status: WalletAdjustmentRequestStatus.PENDING, expiresAt: { gt: now } } });
        if (open >= WALLET_ADJUSTMENT_PENDING_CAP) throw new ValidationApiException({ field: "userId", reason: "TOO_MANY_PENDING", max: WALLET_ADJUSTMENT_PENDING_CAP });
        const balances = deriveWalletBalances(await tx.walletEntry.findMany({ where: { walletAccountId: account.id } }), now);
        if (input.direction === WalletAdjustmentDirection.DEBIT && balances[input.balanceType] < input.amount) {
          throw new ValidationApiException({ field: "amount", reason: "INSUFFICIENT_WALLET_BALANCE", available: balances[input.balanceType] });
        }
        const created = await tx.walletAdjustmentRequest.create({
          data: {
            userId, direction: input.direction, balanceType: input.balanceType, amountIrr: input.amount, reasonCode: input.reasonCode, note: reason,
            evidenceReference: input.evidenceReference?.trim() || null, idempotencyKey: key, requestedByAdminId: admin.adminUserId,
            expiresAt: new Date(now.getTime() + WALLET_ADJUSTMENT_REQUEST_TTL_MS),
          },
          include: REQUEST_INCLUDE,
        });
        await this.audit.record({
          adminUserId: admin.adminUserId,
          action: "wallet_adjustment.requested",
          entityType: "WalletAdjustmentRequest",
          entityId: created.id,
          reason,
          beforeSummary: { userId, balances },
          afterSummary: { userId, status: created.status, direction: input.direction, balanceType: input.balanceType, amount: input.amount, reasonCode: input.reasonCode, evidenceReference: created.evidenceReference, expiresAt: created.expiresAt.toISOString() },
          requestId,
          tx,
        });
        return created;
      });
      return toRequestDto(row);
    } catch (error) {
      // Two submissions with the same key raced: the second one replays the first instead of failing.
      if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await this.replayRequest(key, userId);
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async replayRequest(key: string, userId: string): Promise<AdminWalletAdjustmentRequestDto | null> {
    const replay = await this.prisma.walletAdjustmentRequest.findUnique({ where: { idempotencyKey: key }, include: REQUEST_INCLUDE });
    if (!replay) return null;
    if (replay.userId !== userId) throw new ValidationApiException({ field: "idempotencyKey", reason: "CONFLICT" });
    return toRequestDto(replay);
  }

  /**
   * FE-16, step two: a different admin with wallet.adjust approves, and the correction is posted — exactly what a
   * correction always posted (a WalletAdjustment, its WalletEntry and a balanced ledger transaction), in the same
   * transaction that moves the request to APPROVED. The request row is locked first, so approvals racing for one
   * request run one after the other and only the first posts; the rest see it decided. A debit re-checks the bucket
   * under the wallet lock and is refused if the money is no longer there (the request then stays PENDING).
   */
  async approveAdjustmentRequest(admin: ResolvedAdminContext, id: string, requestId?: string): Promise<AdminWalletAdjustmentRequestDto> {
    const found = await this.prisma.walletAdjustmentRequest.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new WalletAdjustmentRequestNotFoundException({ requestId: id });
    await this.expireOverdueAdjustmentRequests();

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "wallet_adjustment_requests" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const pending = await tx.walletAdjustmentRequest.findUniqueOrThrow({ where: { id } });
      const now = new Date();
      if (pending.status === WalletAdjustmentRequestStatus.EXPIRED || (pending.status === WalletAdjustmentRequestStatus.PENDING && pending.expiresAt <= now)) {
        throw new WalletAdjustmentRequestExpiredException({ requestId: id, expiresAt: pending.expiresAt.toISOString() });
      }
      if (pending.status !== WalletAdjustmentRequestStatus.PENDING) {
        throw new InvalidWalletAdjustmentRequestTransitionException({ requestId: id, from: pending.status, to: WalletAdjustmentRequestStatus.APPROVED });
      }
      // Two-person control: never the requester, whatever their role (the database CHECK says the same).
      if (pending.requestedByAdminId === admin.adminUserId) throw new WalletAdjustmentSelfApprovalException({ requestId: id });

      const account = await this.wallet.lockAccount(pending.userId, tx);
      const before = deriveWalletBalances(await tx.walletEntry.findMany({ where: { walletAccountId: account.id } }));
      const adjustmentId = randomUUID();
      const entry = pending.direction === WalletAdjustmentDirection.CREDIT
        ? await this.wallet.creditEntry({ userId: pending.userId, balanceType: pending.balanceType, amount: pending.amountIrr, source: WalletCreditSource.MANUAL_CORRECTION, referenceType: WALLET_ADJUSTMENT_REFERENCE, referenceId: adjustmentId, debitAccount: LedgerAccountCode.WALLET_ADJUSTMENT }, tx)
        : await this.wallet.debitForAdjustment({ walletAccountId: account.id, balanceType: pending.balanceType, amount: pending.amountIrr, referenceId: adjustmentId }, tx);
      await tx.walletAdjustment.create({
        data: {
          id: adjustmentId, walletAccountId: account.id, direction: pending.direction, balanceType: pending.balanceType, amount: pending.amountIrr,
          reasonCode: pending.reasonCode, reason: pending.note, evidenceReference: pending.evidenceReference,
          walletEntryId: entry.entryId, createdByAdminId: pending.requestedByAdminId,
        },
      });
      const decided = await tx.walletAdjustmentRequest.update({
        where: { id },
        data: { status: WalletAdjustmentRequestStatus.APPROVED, decidedByAdminId: admin.adminUserId, decidedAt: now, walletAdjustmentId: adjustmentId, walletEntryId: entry.entryId },
        include: REQUEST_INCLUDE,
      });
      const after = deriveWalletBalances(await tx.walletEntry.findMany({ where: { walletAccountId: account.id } }));
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "wallet_adjustment.approved",
        entityType: "WalletAdjustmentRequest",
        entityId: id,
        reason: pending.note,
        beforeSummary: { userId: pending.userId, status: pending.status, balances: before },
        afterSummary: {
          userId: pending.userId, status: decided.status, balances: after, direction: pending.direction, balanceType: pending.balanceType, amount: pending.amountIrr,
          reasonCode: pending.reasonCode, evidenceReference: pending.evidenceReference, requestedByAdminId: pending.requestedByAdminId, walletAdjustmentId: adjustmentId, walletEntryId: entry.entryId,
        },
        requestId,
        tx,
      });
      return decided;
    });
    return toRequestDto(row);
  }

  /** FE-16: decline a pending request with a reason. Nothing is posted. */
  async rejectAdjustmentRequest(admin: ResolvedAdminContext, id: string, reason: string, requestId?: string): Promise<AdminWalletAdjustmentRequestDto> {
    const why = reason.trim();
    if (why.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    const found = await this.prisma.walletAdjustmentRequest.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new WalletAdjustmentRequestNotFoundException({ requestId: id });
    await this.expireOverdueAdjustmentRequests();

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "wallet_adjustment_requests" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const pending = await tx.walletAdjustmentRequest.findUniqueOrThrow({ where: { id } });
      if (pending.status !== WalletAdjustmentRequestStatus.PENDING) {
        throw new InvalidWalletAdjustmentRequestTransitionException({ requestId: id, from: pending.status, to: WalletAdjustmentRequestStatus.REJECTED });
      }
      const decided = await tx.walletAdjustmentRequest.update({
        where: { id },
        data: { status: WalletAdjustmentRequestStatus.REJECTED, decidedByAdminId: admin.adminUserId, decidedAt: new Date(), decisionReason: why },
        include: REQUEST_INCLUDE,
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "wallet_adjustment.rejected",
        entityType: "WalletAdjustmentRequest",
        entityId: id,
        reason: why,
        beforeSummary: { userId: pending.userId, status: pending.status },
        afterSummary: { userId: pending.userId, status: decided.status, direction: pending.direction, balanceType: pending.balanceType, amount: pending.amountIrr, requestedByAdminId: pending.requestedByAdminId },
        requestId,
        tx,
      });
      return decided;
    });
    return toRequestDto(row);
  }

  /** The approval queue: pending requests oldest first (they lapse soonest); otherwise the newest decisions first. */
  async listAdjustmentRequests(query: { status?: WalletAdjustmentRequestStatus; userId?: string; page: number; pageSize: number }): Promise<PaginatedDto<AdminWalletAdjustmentRequestDto>> {
    await this.expireOverdueAdjustmentRequests();
    const where: Prisma.WalletAdjustmentRequestWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.userId ? { userId: query.userId } : {}) };
    const orderBy: Prisma.WalletAdjustmentRequestOrderByWithRelationInput[] = query.status === WalletAdjustmentRequestStatus.PENDING ? [{ createdAt: "asc" }] : [{ status: "asc" }, { createdAt: "desc" }];
    const [rows, total] = await Promise.all([
      this.prisma.walletAdjustmentRequest.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: REQUEST_INCLUDE }),
      this.prisma.walletAdjustmentRequest.count({ where }),
    ]);
    return { items: rows.map(toRequestDto), total, page: query.page, pageSize: query.pageSize };
  }

  /** Pending requests past their window become EXPIRED (lazily, whenever the queue or a decision is read). */
  async expireOverdueAdjustmentRequests(now = new Date()): Promise<number> {
    const { count } = await this.prisma.walletAdjustmentRequest.updateMany({
      where: { status: WalletAdjustmentRequestStatus.PENDING, expiresAt: { lte: now } },
      data: { status: WalletAdjustmentRequestStatus.EXPIRED },
    });
    return count;
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
