import { Injectable, Logger } from "@nestjs/common";
import { NotificationCategory, NotificationPriority, Prisma, WalletAdjustmentRequestStatus, WalletOwnerType, type WalletEntry } from "@prisma/client";
import {
  WALLET_TRANSFER_MAX_IRR,
  WALLET_TRANSFER_REASON_CODES,
  WALLET_TRANSFER_REFUND_REASON_CODES,
  WALLET_TRANSFER_UNRELATED_REASON_CODES,
  type AdminWalletAccountDetailDto,
  type AdminWalletAccountDto,
  type AdminWalletTransferDto,
  type AdminWalletTransferInput,
  type PaginatedDto,
  type WalletTransferReasonCode,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  NotFoundApiException,
  ValidationApiException,
  WalletTransferExpiredException,
  WalletTransferNotPendingException,
  WalletTransferSelfApprovalException,
} from "../../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { WalletService, toBalancesDto, type WalletOwnerRef } from "../../commerce/payments/wallet.service";
import { toTopUpDto } from "../../commerce/payments/wallet-top-up.service";
import { deriveWalletBalances } from "../../commerce/payments/payment-infrastructure.policy";
import {
  WALLET_OWNER_SELECT,
  ownerIsVerified,
  toWalletOwnerDto,
  walletPagePath,
  walletPeople,
  type WalletAccountWithOwner,
} from "../../commerce/payments/wallet-owner";
import { reviewEventId } from "./receipt-review.notifier";

/** FE-16: how long a transfer request waits for a second admin before it lapses. */
export const WALLET_TRANSFER_REQUEST_TTL_MS = 72 * 60 * 60 * 1000;
/** Open (pending, unexpired) transfers out of one wallet at a time. */
export const WALLET_TRANSFER_PENDING_CAP = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_NAME = { select: { id: true, user: { select: { displayName: true } } } } as const;
const LIVE = [WalletAdjustmentRequestStatus.PENDING, WalletAdjustmentRequestStatus.APPROVED];
const TRANSFER_INCLUDE = {
  fromWalletAccount: { select: WALLET_OWNER_SELECT },
  toWalletAccount: { select: WALLET_OWNER_SELECT },
  requestedByAdmin: ADMIN_NAME,
  decidedByAdmin: ADMIN_NAME,
  reversals: { where: { status: { in: LIVE } }, select: { id: true } },
} satisfies Prisma.WalletTransferRequestInclude;
type TransferRow = Prisma.WalletTransferRequestGetPayload<{ include: typeof TRANSFER_INCLUDE }>;
const toman = (rial: number) => Math.round(rial / 10).toLocaleString("en-US");

function toTransferDto(row: TransferRow): AdminWalletTransferDto {
  return {
    id: row.id,
    from: toWalletOwnerDto(row.fromWalletAccount),
    to: toWalletOwnerDto(row.toWalletAccount),
    balanceType: row.balanceType,
    amount: row.amountIrr,
    reasonCode: row.reasonCode as WalletTransferReasonCode,
    note: row.note,
    evidenceReference: row.evidenceReference,
    related: row.related,
    status: row.status,
    reversesTransferId: row.reversesTransferId,
    reversalId: row.reversals[0]?.id ?? null,
    requestedBy: { adminUserId: row.requestedByAdmin.id, displayName: row.requestedByAdmin.user.displayName },
    decidedBy: row.decidedByAdmin ? { adminUserId: row.decidedByAdmin.id, displayName: row.decidedByAdmin.user.displayName } : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Staff transfers of credit between two wallets — a member's own wallet or a partner organisation's business wallet —
 * for sensitive cases only (FE-16): one admin with wallet.adjust requests it with a reason code, a note and evidence;
 * a *different* admin with wallet.adjust approves it, and only the approval posts the money (a debit and a credit,
 * each with a balanced ledger transaction through WALLET_TRANSFER_CLEARING). Rules, checked on request and again on
 * approval: a cap per transfer; wallets with no common owner only for a restricted set of reason codes; credit goes
 * into an organisation that is not VERIFIED only as a refund or reversal. Nothing is edited afterwards: a mistake is
 * undone by a reversal, itself a new two-person request. Both wallet owners get an in-app notice when it posts.
 */
@Injectable()
export class AdminWalletTransfersService {
  private readonly logger = new Logger(AdminWalletTransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AdminAuditLogService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  // ---------------------------------------------------------------- wallets

  /** Wallets of one kind of owner: members by name/email/phone, organisations by name or id (created empty if new). */
  async listAccounts(query: { type: WalletOwnerType; q?: string; page: number; pageSize: number }): Promise<PaginatedDto<AdminWalletAccountDto>> {
    const q = query.q?.trim() ?? "";
    const skip = (query.page - 1) * query.pageSize;
    let owners: string[] = [];
    let total = 0;
    if (query.type === WalletOwnerType.MEMBER) {
      if (!q) {
        const where: Prisma.WalletAccountWhereInput = { ownerType: WalletOwnerType.MEMBER };
        const [rows, count] = await Promise.all([this.prisma.walletAccount.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: query.pageSize, select: { userId: true } }), this.prisma.walletAccount.count({ where })]);
        owners = rows.map((r) => r.userId!);
        total = count;
      } else {
        const where: Prisma.UserWhereInput = UUID.test(q) ? { id: q } : { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] };
        const [rows, count] = await Promise.all([this.prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: query.pageSize, select: { id: true } }), this.prisma.user.count({ where })]);
        owners = rows.map((r) => r.id);
        total = count;
      }
    } else if (query.type === WalletOwnerType.SELLER) {
      const where: Prisma.SellerOrganizationWhereInput = !q ? {} : UUID.test(q) ? { id: q } : { name: { contains: q, mode: "insensitive" } };
      const [rows, count] = await Promise.all([this.prisma.sellerOrganization.findMany({ where, orderBy: { name: "asc" }, skip, take: query.pageSize, select: { id: true } }), this.prisma.sellerOrganization.count({ where })]);
      owners = rows.map((r) => r.id);
      total = count;
    } else {
      const where: Prisma.ProviderOrganizationWhereInput = { isDemoRecord: false, ...(!q ? {} : UUID.test(q) ? { id: q } : { name: { contains: q, mode: "insensitive" } }) };
      const [rows, count] = await Promise.all([this.prisma.providerOrganization.findMany({ where, orderBy: { name: "asc" }, skip, take: query.pageSize, select: { id: true } }), this.prisma.providerOrganization.count({ where })]);
      owners = rows.map((r) => r.id);
      total = count;
    }
    const ids: string[] = [];
    for (const id of owners) ids.push((await this.wallet.accountForOwner({ type: query.type, id })).id);
    const accounts = await this.prisma.walletAccount.findMany({ where: { id: { in: ids } }, select: { ...WALLET_OWNER_SELECT, entries: true } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const now = new Date();
    const items = ids.map((id) => byId.get(id)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => this.toAccountDto(a, a.entries, now));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private toAccountDto(account: WalletAccountWithOwner, entries: WalletEntry[], now: Date): AdminWalletAccountDto {
    const last = entries.reduce<Date | null>((max, e) => (!max || e.createdAt > max ? e.createdAt : max), null);
    return { owner: toWalletOwnerDto(account), balances: toBalancesDto(deriveWalletBalances(entries, now), account.currency), lastActivityAt: last?.toISOString() ?? null };
  }

  async accountDetail(walletAccountId: string): Promise<AdminWalletAccountDetailDto> {
    const account = await this.prisma.walletAccount.findUnique({ where: { id: walletAccountId }, select: { ...WALLET_OWNER_SELECT, entries: true } });
    if (!account) throw new NotFoundApiException("Wallet");
    await this.expireOverdue();
    const [entries, topUps, transfers] = await Promise.all([
      this.prisma.walletEntry.findMany({ where: { walletAccountId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
      this.prisma.walletTopUp.findMany({
        where: account.ownerType === WalletOwnerType.MEMBER ? { userId: account.userId!, walletAccountId: null } : { walletAccountId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { displayName: true } }, reviewedByAdmin: { select: { user: { select: { displayName: true } } } } },
      }),
      this.prisma.walletTransferRequest.findMany({ where: { OR: [{ fromWalletAccountId: walletAccountId }, { toWalletAccountId: walletAccountId }] }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 50, include: TRANSFER_INCLUDE }),
    ]);
    const owner = account.ownerType === WalletOwnerType.MEMBER ? null : toWalletOwnerDto(account);
    return {
      account: this.toAccountDto(account, account.entries, new Date()),
      entries: await this.wallet.toEntryDtos(entries),
      topUps: topUps.map((t) => ({
        ...toTopUpDto(t),
        userId: t.userId,
        userDisplayName: t.user.displayName,
        businessWallet: owner,
        cardNumberMasked: t.cardNumberMasked,
        receiptUploadedAt: t.receiptUploadedAt?.toISOString() ?? null,
        reviewedAt: t.reviewedAt?.toISOString() ?? null,
        reviewedBy: t.reviewedByAdmin?.user.displayName ?? null,
        failureCode: t.failureCode,
      })),
      transfers: transfers.map(toTransferDto),
    };
  }

  // ---------------------------------------------------------------- transfers

  async list(query: { status?: WalletAdjustmentRequestStatus; walletAccountId?: string; page: number; pageSize: number }): Promise<PaginatedDto<AdminWalletTransferDto>> {
    await this.expireOverdue();
    const where: Prisma.WalletTransferRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.walletAccountId ? { OR: [{ fromWalletAccountId: query.walletAccountId }, { toWalletAccountId: query.walletAccountId }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.walletTransferRequest.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: TRANSFER_INCLUDE }),
      this.prisma.walletTransferRequest.count({ where }),
    ]);
    return { items: rows.map(toTransferDto), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<AdminWalletTransferDto> {
    const row = await this.prisma.walletTransferRequest.findUnique({ where: { id }, include: TRANSFER_INCLUDE });
    if (!row) throw new NotFoundApiException("Wallet transfer");
    return toTransferDto(row);
  }

  /** FE-16, step one: ask for a transfer. Validated in full (owners, rules, balance) but no money moves. */
  async request(admin: ResolvedAdminContext, input: AdminWalletTransferInput, idempotencyKey: string | undefined, requestId?: string): Promise<AdminWalletTransferDto> {
    const key = idempotencyKey?.trim() || null;
    if (key) {
      const replay = await this.replay(key, admin.adminUserId);
      if (replay) return replay;
    }
    const note = input.note?.trim() ?? "";
    const evidence = input.evidenceReference?.trim() ?? "";
    if (note.length < 5 || note.length > 1000) throw new ValidationApiException({ field: "note", reason: "REQUIRED", min: 5, max: 1000 });
    if (evidence.length < 3 || evidence.length > 300) throw new ValidationApiException({ field: "evidenceReference", reason: "REQUIRED", min: 3, max: 300 });
    if (!(WALLET_TRANSFER_REASON_CODES as readonly string[]).includes(input.reasonCode)) throw new ValidationApiException({ field: "reasonCode", reason: "UNKNOWN", allowed: WALLET_TRANSFER_REASON_CODES });
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > WALLET_TRANSFER_MAX_IRR) throw new ValidationApiException({ field: "amount", reason: "OUT_OF_RANGE", max: WALLET_TRANSFER_MAX_IRR });
    if (input.from.type === input.to.type && input.from.id === input.to.id) throw new ValidationApiException({ field: "to", reason: "SAME_WALLET" });
    await Promise.all([this.assertOwnerExists(input.from, "from"), this.assertOwnerExists(input.to, "to")]);

    const now = new Date();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const fromId = (await this.wallet.accountForOwner(input.from, tx)).id;
        const toId = (await this.wallet.accountForOwner(input.to, tx)).id;
        await this.lockBoth(tx, fromId, toId);
        const { from, to, related } = await this.checkRules(tx, fromId, toId, input.reasonCode);
        const open = await tx.walletTransferRequest.count({ where: { fromWalletAccountId: fromId, status: WalletAdjustmentRequestStatus.PENDING, expiresAt: { gt: now } } });
        if (open >= WALLET_TRANSFER_PENDING_CAP) throw new ValidationApiException({ field: "from", reason: "TOO_MANY_PENDING", max: WALLET_TRANSFER_PENDING_CAP });
        const available = (await this.wallet.balancesOf(fromId, tx, now))[input.balanceType];
        if (available < input.amount) throw new ValidationApiException({ field: "amount", reason: "INSUFFICIENT_WALLET_BALANCE", available });
        const created = await tx.walletTransferRequest.create({
          data: {
            fromWalletAccountId: fromId, toWalletAccountId: toId, balanceType: input.balanceType, amountIrr: input.amount, reasonCode: input.reasonCode,
            note, evidenceReference: evidence, related, idempotencyKey: key, requestedByAdminId: admin.adminUserId,
            expiresAt: new Date(now.getTime() + WALLET_TRANSFER_REQUEST_TTL_MS),
          },
          include: TRANSFER_INCLUDE,
        });
        await this.audit.record({
          adminUserId: admin.adminUserId, action: "wallet_transfer.requested", entityType: "WalletTransferRequest", entityId: created.id, reason: note,
          afterSummary: { from: toWalletOwnerDto(from), to: toWalletOwnerDto(to), balanceType: input.balanceType, amount: input.amount, reasonCode: input.reasonCode, evidenceReference: evidence, related, availableBefore: available, expiresAt: created.expiresAt.toISOString() },
          requestId, tx,
        });
        return created;
      });
      return toTransferDto(row);
    } catch (error) {
      if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await this.replay(key, admin.adminUserId);
        if (replay) return replay;
      }
      throw error;
    }
  }

  /**
   * FE-16, step two: a different admin approves and the transfer posts, in the transaction that claims the request.
   * Rules and the source balance are checked again under both wallet locks; if they no longer hold, nothing posts and
   * the request stays pending.
   */
  async approve(admin: ResolvedAdminContext, id: string, requestId?: string): Promise<AdminWalletTransferDto> {
    await this.expireOverdue();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "wallet_transfer_requests" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const pending = await tx.walletTransferRequest.findUnique({ where: { id } });
      if (!pending) throw new NotFoundApiException("Wallet transfer");
      const now = new Date();
      if (pending.status === WalletAdjustmentRequestStatus.EXPIRED || (pending.status === WalletAdjustmentRequestStatus.PENDING && pending.expiresAt <= now)) {
        throw new WalletTransferExpiredException({ transferId: id, expiresAt: pending.expiresAt.toISOString() });
      }
      if (pending.status !== WalletAdjustmentRequestStatus.PENDING) throw new WalletTransferNotPendingException({ transferId: id, status: pending.status });
      if (pending.requestedByAdminId === admin.adminUserId) throw new WalletTransferSelfApprovalException({ transferId: id });

      await this.lockBoth(tx, pending.fromWalletAccountId, pending.toWalletAccountId);
      const { from, to, related } = await this.checkRules(tx, pending.fromWalletAccountId, pending.toWalletAccountId, pending.reasonCode as WalletTransferReasonCode);
      const before = { from: await this.wallet.balancesOf(from.id, tx), to: await this.wallet.balancesOf(to.id, tx) };
      const posted = await this.wallet.postTransfer({ fromWalletAccountId: from.id, toWalletAccountId: to.id, balanceType: pending.balanceType, amount: pending.amountIrr, transferId: id }, tx);
      const decided = await tx.walletTransferRequest.update({
        where: { id },
        data: { status: WalletAdjustmentRequestStatus.APPROVED, decidedByAdminId: admin.adminUserId, decidedAt: now, related, debitEntryId: posted.debitEntryId, creditEntryId: posted.creditEntryId },
        include: TRANSFER_INCLUDE,
      });
      const after = { from: await this.wallet.balancesOf(from.id, tx), to: await this.wallet.balancesOf(to.id, tx) };
      await this.audit.record({
        adminUserId: admin.adminUserId, action: "wallet_transfer.approved", entityType: "WalletTransferRequest", entityId: id, reason: pending.note,
        beforeSummary: { status: pending.status, balances: before },
        afterSummary: {
          status: decided.status, balances: after, from: toWalletOwnerDto(from), to: toWalletOwnerDto(to), balanceType: pending.balanceType, amount: pending.amountIrr,
          reasonCode: pending.reasonCode, evidenceReference: pending.evidenceReference, related, requestedByAdminId: pending.requestedByAdminId,
          reversesTransferId: pending.reversesTransferId, debitEntryId: posted.debitEntryId, creditEntryId: posted.creditEntryId,
        },
        requestId, tx,
      });
      return decided;
    });
    await this.notifyPosted(row);
    return toTransferDto(row);
  }

  /** Decline (or withdraw) a pending transfer with a reason. Nothing is posted. */
  async reject(admin: ResolvedAdminContext, id: string, reason: string, requestId?: string): Promise<AdminWalletTransferDto> {
    const why = reason?.trim() ?? "";
    if (why.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    await this.expireOverdue();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "wallet_transfer_requests" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const pending = await tx.walletTransferRequest.findUnique({ where: { id } });
      if (!pending) throw new NotFoundApiException("Wallet transfer");
      if (pending.status === WalletAdjustmentRequestStatus.EXPIRED) throw new WalletTransferExpiredException({ transferId: id, expiresAt: pending.expiresAt.toISOString() });
      if (pending.status !== WalletAdjustmentRequestStatus.PENDING) throw new WalletTransferNotPendingException({ transferId: id, status: pending.status });
      // The database's second-person CHECK covers decidedByAdminId, so a requester withdrawing their own request is
      // recorded in the audit log only (decidedBy stays empty).
      const own = pending.requestedByAdminId === admin.adminUserId;
      const decided = await tx.walletTransferRequest.update({
        where: { id },
        data: { status: WalletAdjustmentRequestStatus.REJECTED, decidedByAdminId: own ? null : admin.adminUserId, decidedAt: new Date(), decisionReason: why },
        include: TRANSFER_INCLUDE,
      });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "wallet_transfer.rejected", entityType: "WalletTransferRequest", entityId: id, reason: why, beforeSummary: { status: pending.status }, afterSummary: { status: decided.status, withdrawnByRequester: own }, requestId, tx });
      return decided;
    });
    return toTransferDto(row);
  }

  /**
   * Undo an approved transfer: a NEW pending request for the same amount in the other direction (reason REVERSAL),
   * which a second admin must approve like any transfer. At most one live reversal per transfer; a reversal itself
   * cannot be reversed (ask for a fresh transfer instead).
   */
  async reverse(admin: ResolvedAdminContext, id: string, input: { note: string; evidenceReference: string }, requestId?: string): Promise<AdminWalletTransferDto> {
    const note = input.note?.trim() ?? "";
    const evidence = input.evidenceReference?.trim() ?? "";
    if (note.length < 5 || note.length > 1000) throw new ValidationApiException({ field: "note", reason: "REQUIRED", min: 5, max: 1000 });
    if (evidence.length < 3 || evidence.length > 300) throw new ValidationApiException({ field: "evidenceReference", reason: "REQUIRED", min: 3, max: 300 });
    const now = new Date();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "wallet_transfer_requests" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const original = await tx.walletTransferRequest.findUnique({ where: { id } });
        if (!original) throw new NotFoundApiException("Wallet transfer");
        if (original.status !== WalletAdjustmentRequestStatus.APPROVED) throw new ValidationApiException({ field: "transfer", reason: "NOT_APPROVED" });
        if (original.reversesTransferId) throw new ValidationApiException({ field: "transfer", reason: "CANNOT_REVERSE_A_REVERSAL" });
        if (await tx.walletTransferRequest.count({ where: { reversesTransferId: id, status: { in: LIVE } } })) throw new ValidationApiException({ field: "transfer", reason: "ALREADY_REVERSED" });
        const created = await tx.walletTransferRequest.create({
          data: {
            fromWalletAccountId: original.toWalletAccountId, toWalletAccountId: original.fromWalletAccountId, balanceType: original.balanceType, amountIrr: original.amountIrr,
            reasonCode: "REVERSAL", note, evidenceReference: evidence, related: original.related, reversesTransferId: id, requestedByAdminId: admin.adminUserId,
            expiresAt: new Date(now.getTime() + WALLET_TRANSFER_REQUEST_TTL_MS),
          },
          include: TRANSFER_INCLUDE,
        });
        await this.audit.record({
          adminUserId: admin.adminUserId, action: "wallet_transfer.reversal_requested", entityType: "WalletTransferRequest", entityId: created.id, reason: note,
          afterSummary: { reversesTransferId: id, amount: original.amountIrr, balanceType: original.balanceType, evidenceReference: evidence, expiresAt: created.expiresAt.toISOString() },
          requestId, tx,
        });
        return created;
      });
      return toTransferDto(row);
    } catch (error) {
      // The partial unique index "one live reversal per transfer" caught a concurrent reversal.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ValidationApiException({ field: "transfer", reason: "ALREADY_REVERSED" });
      throw error;
    }
  }

  async expireOverdue(now = new Date()): Promise<number> {
    const { count } = await this.prisma.walletTransferRequest.updateMany({ where: { status: WalletAdjustmentRequestStatus.PENDING, expiresAt: { lte: now } }, data: { status: WalletAdjustmentRequestStatus.EXPIRED } });
    return count;
  }

  // ---------------------------------------------------------------- rules and helpers

  /**
   * The transfer rules, on the locked rows: wallets with no common owner only with an unrelated-allowed reason code,
   * and credit into an organisation that is not VERIFIED only as a refund or reversal.
   */
  private async checkRules(tx: Prisma.TransactionClient, fromId: string, toId: string, reasonCode: WalletTransferReasonCode): Promise<{ from: WalletAccountWithOwner; to: WalletAccountWithOwner; related: boolean }> {
    if (fromId === toId) throw new ValidationApiException({ field: "to", reason: "SAME_WALLET" });
    const [from, to] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { id: fromId }, select: WALLET_OWNER_SELECT }),
      tx.walletAccount.findUniqueOrThrow({ where: { id: toId }, select: WALLET_OWNER_SELECT }),
    ]);
    const related = await this.related(tx, from, to);
    if (!related && !WALLET_TRANSFER_UNRELATED_REASON_CODES.includes(reasonCode)) {
      throw new ValidationApiException({ field: "reasonCode", reason: "UNRELATED_WALLETS", allowed: WALLET_TRANSFER_UNRELATED_REASON_CODES });
    }
    if (!ownerIsVerified(to) && !WALLET_TRANSFER_REFUND_REASON_CODES.includes(reasonCode)) {
      throw new ValidationApiException({ field: "to", reason: "DESTINATION_NOT_VERIFIED", allowed: WALLET_TRANSFER_REFUND_REASON_CODES });
    }
    return { from, to, related };
  }

  /**
   * Same owner: a member and an organisation they are an active member of; two organisations that share a wallet
   * manager. Two different members are never related.
   */
  private async related(tx: Prisma.TransactionClient, a: WalletAccountWithOwner, b: WalletAccountWithOwner): Promise<boolean> {
    const aMember = a.ownerType === WalletOwnerType.MEMBER;
    const bMember = b.ownerType === WalletOwnerType.MEMBER;
    if (aMember && bMember) return false;
    if (aMember || bMember) {
      const member = aMember ? a : b;
      const org = aMember ? b : a;
      return (await walletPeople(tx, org, true)).includes(member.userId!);
    }
    const [x, y] = await Promise.all([walletPeople(tx, a), walletPeople(tx, b)]);
    return x.some((u) => y.includes(u));
  }

  private async lockBoth(tx: Prisma.TransactionClient, a: string, b: string): Promise<void> {
    // A fixed order, so two transfers between the same wallets in opposite directions cannot deadlock.
    for (const id of [a, b].sort()) await this.wallet.lockAccountById(id, tx);
  }

  private async assertOwnerExists(owner: WalletOwnerRef, field: string): Promise<void> {
    if (!UUID.test(owner.id)) throw new ValidationApiException({ field, reason: "OWNER_NOT_FOUND" });
    const found =
      owner.type === WalletOwnerType.MEMBER ? await this.prisma.user.findUnique({ where: { id: owner.id }, select: { id: true } })
      : owner.type === WalletOwnerType.SELLER ? await this.prisma.sellerOrganization.findUnique({ where: { id: owner.id }, select: { id: true } })
      : owner.type === WalletOwnerType.PROVIDER ? await this.prisma.providerOrganization.findUnique({ where: { id: owner.id }, select: { id: true } })
      : null;
    if (!found) throw new ValidationApiException({ field, reason: "OWNER_NOT_FOUND" });
  }

  private async replay(key: string, adminUserId: string): Promise<AdminWalletTransferDto | null> {
    const row = await this.prisma.walletTransferRequest.findUnique({ where: { idempotencyKey: key }, include: TRANSFER_INCLUDE });
    if (!row) return null;
    if (row.requestedByAdminId !== adminUserId) throw new ValidationApiException({ field: "idempotencyKey", reason: "CONFLICT" });
    return toTransferDto(row);
  }

  /** Both wallets' people hear that money moved (best effort: a failed notice never undoes a posted transfer). */
  private async notifyPosted(row: TransferRow): Promise<void> {
    const sides = [
      { account: row.fromWalletAccount, type: "wallet.transfer_out", counterparty: toWalletOwnerDto(row.toWalletAccount).name },
      { account: row.toWalletAccount, type: "wallet.transfer_in", counterparty: toWalletOwnerDto(row.fromWalletAccount).name },
    ];
    for (const side of sides) {
      try {
        const people = await walletPeople(this.prisma, side.account);
        for (const userId of people) {
          await this.notifications.notify({
            userId, type: side.type, category: NotificationCategory.PAYMENT, priority: NotificationPriority.HIGH,
            templateParams: { amount: toman(row.amountIrr), wallet: toWalletOwnerDto(side.account).name, counterparty: side.counterparty, reason: row.note },
            deepLink: walletPagePath(side.account), entityType: "WalletTransferRequest", entityId: row.id,
            domainEventId: reviewEventId(`wallet-transfer:${row.id}:${side.type}:${userId}`),
          });
        }
      } catch (error) {
        this.logger.error(`Wallet transfer notice ${side.type} for ${row.id} failed`, error instanceof Error ? error.stack : undefined);
      }
    }
  }
}
