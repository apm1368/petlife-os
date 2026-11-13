import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LedgerAccountCode, Prisma, WalletBalanceType, WalletCreditSource, WalletTopUpRail, WalletTopUpStatus, type WalletTopUp } from "@prisma/client";
import type { WalletTopUpDto, WalletTopUpOptionsDto, WalletTopUpStartedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { assertObjectKeyUnder } from "../../../common/storage-keys/object-key.validator";
import type { AppEnv } from "../../../config/env";
import { StorageService } from "../../storage/storage.service";
import { WalletService, WALLET_TOP_UP_REFERENCE } from "./wallet.service";
import { ZibalGateway } from "./zibal.gateway";
import { CardTransferDestinationService, type CompanyAccount } from "./card-transfer-destination.service";
import {
  OPEN_TOP_UP_STATUSES,
  WALLET_CARD_RECEIPT_WINDOW_MS,
  WALLET_MAX_OPEN_TOP_UPS,
  WALLET_TOP_UP_MAX_IRR,
  WALLET_TOP_UP_MIN_IRR,
  WALLET_TOP_UP_PRESETS_IRR,
  availableTopUpRails,
  isReceiptWindowOver,
  validTopUpAmount,
  walletReturnUrl,
} from "./wallet-top-up.policy";

export function toTopUpDto(row: WalletTopUp, now = new Date()): WalletTopUpDto {
  return {
    id: row.id,
    rail: row.rail,
    status: isReceiptWindowOver(row, now) ? WalletTopUpStatus.EXPIRED : row.status,
    amount: row.amount,
    receivedAmount: row.receivedAmount,
    currency: row.currency,
    receiptUploaded: !!row.receiptObjectKey,
    receiptDeadlineAt: row.receiptDeadlineAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    creditedAt: row.creditedAt?.toISOString() ?? null,
    walletAccountId: row.walletAccountId,
  };
}

/**
 * Member top-ups. Money enters a wallet only when real money is confirmed — Zibal's verify in production mode, or
 * finance approving a card-to-card receipt — and exactly once: the credit and the CREDITED status are written in one
 * transaction whose status change is conditional, so a replayed verify or a double-clicked approval writes nothing.
 */
@Injectable()
export class WalletTopUpService {
  private readonly logger = new Logger(WalletTopUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly wallet: WalletService,
    private readonly gateway: ZibalGateway,
    private readonly storage: StorageService,
    private readonly destinations: CardTransferDestinationService,
  ) {}

  private railConfig() {
    return {
      PAYMENT_SANDBOX_MODE: this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }),
      ZIBAL_ENABLED: this.config.get("ZIBAL_ENABLED", { infer: true }),
      ZIBAL_MERCHANT: this.config.get("ZIBAL_MERCHANT", { infer: true }),
      CARD_TRANSFER_ACCOUNT_NUMBER: this.config.get("CARD_TRANSFER_ACCOUNT_NUMBER", { infer: true }),
      CARD_TRANSFER_ACCOUNT_HOLDER: this.config.get("CARD_TRANSFER_ACCOUNT_HOLDER", { infer: true }),
    };
  }

  /** The company card a member transfers to, only while it can take a card-to-card payment (it has a card number). */
  private async card(): Promise<CompanyAccount | null> {
    const account = await this.destinations.current();
    return account?.cardNumber ? account : null;
  }

  private instructions(account: CompanyAccount) {
    return { cardNumber: account.cardNumberFormatted!, cardHolderName: account.holderName, bankName: account.bankName, sheba: account.sheba };
  }

  async options(): Promise<WalletTopUpOptionsDto> {
    return { rails: availableTopUpRails(this.railConfig(), !!(await this.card())), minAmount: WALLET_TOP_UP_MIN_IRR, maxAmount: WALLET_TOP_UP_MAX_IRR, presets: WALLET_TOP_UP_PRESETS_IRR };
  }

  /** The member's own-wallet top-ups (business top-ups they started are listed on that organisation's wallet). */
  async list(userId: string): Promise<WalletTopUpDto[]> {
    const rows = await this.prisma.walletTopUp.findMany({ where: { userId, walletAccountId: null }, orderBy: { createdAt: "desc" }, take: 20 });
    const now = new Date();
    return rows.map((r) => toTopUpDto(r, now));
  }

  /** Every top-up of one business wallet, whoever of its managers started it (the caller checked access). */
  async listForAccount(walletAccountId: string): Promise<WalletTopUpDto[]> {
    const rows = await this.prisma.walletTopUp.findMany({ where: { walletAccountId }, orderBy: { createdAt: "desc" }, take: 20 });
    const now = new Date();
    return rows.map((r) => toTopUpDto(r, now));
  }

  /** The instructions a member needs again after a reload: the card for an open card-to-card request. */
  async get(userId: string, id: string): Promise<WalletTopUpStartedDto> {
    const row = await this.own(userId, id);
    const open = row.status === WalletTopUpStatus.AWAITING_RECEIPT && !isReceiptWindowOver(row);
    // The account this request was started with, even if the owner has changed it since: the member may already
    // have transferred to it, and finance checks the receipt against it.
    const account = open && row.rail === WalletTopUpRail.CARD_TO_CARD ? await this.destinations.forPayment(row.cardTransferDestinationId) : null;
    return { topUp: toTopUpDto(row), redirectUrl: null, cardTransfer: account?.cardNumber ? this.instructions(account) : null };
  }

  /**
   * Starts a top-up of the member's own wallet, or — with `business` — of a business wallet the caller manages (the
   * caller checked that). The member who starts it is the only one who can send its receipt or cancel it.
   */
  async start(userId: string, input: { amount: number; rail: WalletTopUpRail; locale: string }, idempotencyKey: string | undefined, business?: { walletAccountId: string; returnPath: string }): Promise<WalletTopUpStartedDto> {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 120) throw new ValidationApiException({ field: "idempotencyKey", reason: "REQUIRED" });
    const replay = await this.prisma.walletTopUp.findUnique({ where: { idempotencyKey: key } });
    if (replay) {
      // A key is client-chosen: someone else's row under it is a conflict, never a replay.
      if (replay.userId !== userId || replay.walletAccountId !== (business?.walletAccountId ?? null)) throw new ValidationApiException({ field: "idempotencyKey", reason: "CONFLICT" });
      return this.get(userId, replay.id);
    }
    if (!validTopUpAmount(input.amount)) throw new ValidationApiException({ field: "amount", reason: "OUT_OF_RANGE", min: WALLET_TOP_UP_MIN_IRR, max: WALLET_TOP_UP_MAX_IRR });
    const config = this.railConfig();
    const card = input.rail === WalletTopUpRail.CARD_TO_CARD ? await this.card() : null;
    if (!availableTopUpRails(config, !!card).includes(input.rail)) throw new ValidationApiException({ field: "rail", reason: "TOP_UP_RAIL_UNAVAILABLE" });
    await this.expireOverdue(userId);
    const open = await this.prisma.walletTopUp.count({ where: { userId, status: { in: OPEN_TOP_UP_STATUSES } } });
    if (open >= WALLET_MAX_OPEN_TOP_UPS) throw new ValidationApiException({ field: "topUp", reason: "TOO_MANY_OPEN_TOP_UPS", max: WALLET_MAX_OPEN_TOP_UPS });

    if (input.rail === WalletTopUpRail.CARD_TO_CARD && card) {
      const row = await this.prisma.walletTopUp.create({
        data: {
          userId, walletAccountId: business?.walletAccountId ?? null, rail: input.rail, status: WalletTopUpStatus.AWAITING_RECEIPT, amount: input.amount, idempotencyKey: key,
          cardNumberMasked: card.cardNumberMasked, cardHolderName: card.holderName, cardTransferDestinationId: card.destinationId,
          receiptDeadlineAt: new Date(Date.now() + WALLET_CARD_RECEIPT_WINDOW_MS),
        },
      });
      return { topUp: toTopUpDto(row), redirectUrl: null, cardTransfer: this.instructions(card) };
    }

    const row = await this.prisma.walletTopUp.create({ data: { userId, walletAccountId: business?.walletAccountId ?? null, rail: input.rail, status: WalletTopUpStatus.AWAITING_PAYMENT, amount: input.amount, idempotencyKey: key } });
    try {
      const callbackUrl = walletReturnUrl(this.config.get("WEB_APP_ORIGIN", { infer: true }), input.locale, business?.returnPath);
      const remote = await this.gateway.request(row.amount, callbackUrl, row.id);
      const updated = await this.prisma.walletTopUp.update({ where: { id: row.id }, data: { zibalTrackId: remote.trackId } });
      return { topUp: toTopUpDto(updated), redirectUrl: remote.redirectUrl, cardTransfer: null };
    } catch (error) {
      this.logger.warn(`Zibal top-up request failed for ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      await this.prisma.walletTopUp.update({ where: { id: row.id }, data: { status: WalletTopUpStatus.FAILED, failureCode: "ZIBAL_REQUEST_UNAVAILABLE" } });
      throw new ValidationApiException({ field: "zibal", reason: "ZIBAL_REQUEST_UNAVAILABLE" });
    }
  }

  /** Called when Zibal sends the member back. Only the member who started it can settle it, and only once. */
  async verifyZibal(userId: string, trackId: string): Promise<WalletTopUpDto> {
    const row = await this.prisma.walletTopUp.findUnique({ where: { zibalTrackId: trackId } });
    if (!row || row.userId !== userId) throw new ValidationApiException({ field: "trackId", reason: "NOT_FOUND" });
    if (row.status !== WalletTopUpStatus.AWAITING_PAYMENT) return toTopUpDto(row);
    // The sandbox gateway answers "verified" to anything; never let that become money.
    if (!availableTopUpRails(this.railConfig()).includes(WalletTopUpRail.ZIBAL)) throw new ValidationApiException({ field: "rail", reason: "TOP_UP_RAIL_UNAVAILABLE" });
    let verified: boolean;
    let failureCode: string | undefined;
    try {
      const remote = await this.gateway.verify(trackId);
      verified = remote.verified;
      failureCode = remote.failureCode;
    } catch {
      // Unknown is not failed: the member may have paid. Leave it awaiting so a later verify (or finance) settles it.
      throw new ValidationApiException({ field: "zibal", reason: "ZIBAL_VERIFY_UNKNOWN_TRY_AGAIN" });
    }
    if (!verified) {
      await this.prisma.walletTopUp.updateMany({ where: { id: row.id, status: WalletTopUpStatus.AWAITING_PAYMENT }, data: { status: WalletTopUpStatus.FAILED, failureCode: failureCode ?? "ZIBAL_NOT_VERIFIED" } });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM wallet_top_ups WHERE id = ${row.id}::uuid FOR UPDATE`;
        const current = await tx.walletTopUp.findUniqueOrThrow({ where: { id: row.id } });
        if (current.status !== WalletTopUpStatus.AWAITING_PAYMENT) return; // a parallel return already settled it
        await this.creditOnce(tx, current, current.amount, LedgerAccountCode.CASH_GATEWAY_RECEIVABLE, WalletTopUpStatus.AWAITING_PAYMENT);
      });
    }
    return toTopUpDto(await this.prisma.walletTopUp.findUniqueOrThrow({ where: { id: row.id } }));
  }

  async receiptUploadTarget(userId: string, id: string, contentType: string, fileSizeBytes: number) {
    const row = await this.ownAwaitingReceipt(userId, id);
    return this.storage.createWalletTopUpReceiptUploadTarget(row.id, contentType, fileSizeBytes);
  }

  async submitReceipt(userId: string, id: string, receiptObjectKey: string): Promise<WalletTopUpDto> {
    const row = await this.ownAwaitingReceipt(userId, id);
    assertObjectKeyUnder(receiptObjectKey, "wallet-top-up-receipts", row.id);
    const updated = await this.prisma.walletTopUp.updateMany({
      where: { id: row.id, status: WalletTopUpStatus.AWAITING_RECEIPT },
      data: { status: WalletTopUpStatus.REVIEW_PENDING, receiptObjectKey, receiptUploadedAt: new Date() },
    });
    if (!updated.count) throw new ValidationApiException({ field: "topUp", reason: "NOT_AWAITING_RECEIPT" });
    return toTopUpDto(await this.prisma.walletTopUp.findUniqueOrThrow({ where: { id: row.id } }));
  }

  /** Only before a receipt is sent: after that money may already be on its way, so finance decides. */
  async cancel(userId: string, id: string): Promise<WalletTopUpDto> {
    const row = await this.own(userId, id);
    const updated = await this.prisma.walletTopUp.updateMany({ where: { id: row.id, status: WalletTopUpStatus.AWAITING_RECEIPT }, data: { status: WalletTopUpStatus.CANCELLED } });
    if (!updated.count) throw new ValidationApiException({ field: "topUp", reason: "NOT_CANCELLABLE" });
    return toTopUpDto(await this.prisma.walletTopUp.findUniqueOrThrow({ where: { id: row.id } }));
  }

  /**
   * Finance's decision on a card-to-card receipt. Approval credits what actually arrived (receivedAmount), which may
   * differ from what was requested; the audit row is written by the caller inside the same transaction.
   */
  async review(tx: Prisma.TransactionClient, adminUserId: string, id: string, input: { approve: boolean; receivedAmount?: number; reason?: string }): Promise<WalletTopUp> {
    // Lock first: a second reviewer (or a double click) waits here, then reads the settled status and stops.
    await tx.$queryRaw`SELECT id FROM wallet_top_ups WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.walletTopUp.findUnique({ where: { id } });
    if (!row || row.rail !== WalletTopUpRail.CARD_TO_CARD) throw new ValidationApiException({ field: "topUp", reason: "NOT_FOUND" });
    if (row.status !== WalletTopUpStatus.REVIEW_PENDING) throw new ValidationApiException({ field: "topUp", reason: "NOT_REVIEWABLE" });
    const now = new Date();
    if (!input.approve) {
      const reason = input.reason?.trim();
      if (!reason || reason.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
      const done = await tx.walletTopUp.updateMany({ where: { id, status: WalletTopUpStatus.REVIEW_PENDING }, data: { status: WalletTopUpStatus.REJECTED, rejectionReason: reason, reviewedAt: now, reviewedByAdminId: adminUserId, receivedAmount: input.receivedAmount ?? 0 } });
      if (!done.count) throw new ValidationApiException({ field: "topUp", reason: "NOT_REVIEWABLE" });
      return tx.walletTopUp.findUniqueOrThrow({ where: { id } });
    }
    const received = input.receivedAmount ?? row.amount;
    if (!Number.isInteger(received) || received <= 0 || received > WALLET_TOP_UP_MAX_IRR * 2) throw new ValidationApiException({ field: "receivedAmount", reason: "INTEGER_RIAL_REQUIRED" });
    await this.creditOnce(tx, row, received, LedgerAccountCode.CARD_TRANSFER_RECEIVABLE, WalletTopUpStatus.REVIEW_PENDING, { reviewedAt: now, reviewedByAdminId: adminUserId, receivedAmount: received });
    return tx.walletTopUp.findUniqueOrThrow({ where: { id } });
  }

  /** Signed, short-lived link to the receipt for finance (the caller checks the permission and audits the view). */
  async receiptDownload(id: string) {
    const row = await this.prisma.walletTopUp.findUnique({ where: { id } });
    if (!row?.receiptObjectKey) throw new ValidationApiException({ field: "receipt", reason: "NOT_FOUND" });
    return this.storage.createPrivateDownloadTarget(row.receiptObjectKey);
  }

  /** Writes overdue card-to-card requests as EXPIRED (they were already shown as expired). */
  async expireOverdue(userId?: string, now = new Date()): Promise<number> {
    const result = await this.prisma.walletTopUp.updateMany({
      where: { status: WalletTopUpStatus.AWAITING_RECEIPT, receiptDeadlineAt: { lte: now }, ...(userId ? { userId } : {}) },
      data: { status: WalletTopUpStatus.EXPIRED },
    });
    return result.count;
  }

  private async creditOnce(tx: Prisma.TransactionClient, row: WalletTopUp, amount: number, debitAccount: LedgerAccountCode, from: WalletTopUpStatus, extra: Prisma.WalletTopUpUncheckedUpdateManyInput = {}) {
    // A business top-up credits the organisation's wallet, never the member who paid it.
    const credit = await this.wallet.creditEntry({
      userId: row.userId, walletAccountId: row.walletAccountId ?? undefined, balanceType: WalletBalanceType.PURCHASE_ONLY, amount, source: WalletCreditSource.TOP_UP,
      referenceType: WALLET_TOP_UP_REFERENCE, referenceId: row.id, debitAccount,
    }, tx);
    // Conditional on the status we read: a concurrent approval/verify blocks here, then matches nothing and rolls back its credit.
    const done = await tx.walletTopUp.updateMany({
      where: { id: row.id, status: from },
      data: { ...extra, status: WalletTopUpStatus.CREDITED, walletEntryId: credit.entryId, creditedAt: new Date() },
    });
    if (!done.count) throw new ValidationApiException({ field: "topUp", reason: "ALREADY_SETTLED" });
  }

  private async own(userId: string, id: string) {
    const row = await this.prisma.walletTopUp.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new ValidationApiException({ field: "topUp", reason: "NOT_FOUND" });
    return row;
  }

  private async ownAwaitingReceipt(userId: string, id: string) {
    const row = await this.own(userId, id);
    if (isReceiptWindowOver(row)) {
      await this.expireOverdue(userId);
      throw new ValidationApiException({ field: "receipt", reason: "RECEIPT_WINDOW_EXPIRED" });
    }
    if (row.status !== WalletTopUpStatus.AWAITING_RECEIPT) throw new ValidationApiException({ field: "topUp", reason: "NOT_AWAITING_RECEIPT" });
    return row;
  }
}
