import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CardTransferPaymentStatus, CheckoutStatus, LedgerAccountCode, LedgerEntryDirection, PaymentStatus, WalletBalanceType, WalletCreditSource } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AppEnv } from "../../../config/env";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { assertObjectKeyUnder } from "../../../common/storage-keys/object-key.validator";
import { LedgerService } from "../ledger/ledger.service";
import { CheckoutService } from "../checkout/checkout.service";
import { InventoryReservationService } from "../checkout/inventory-reservation.service";
import { WalletService } from "./wallet.service";
import { CARD_TRANSFER_RECEIPT_WINDOW_MS, CARD_TRANSFER_UNDERPAYMENT_WINDOW_MS, cardTransferAllowedForBooking, nextWorkingReviewAt } from "./payment-infrastructure.policy";

/** Receipt-backed company-card rail. Its state/evidence never shares the generic online-payment model. */
@Injectable()
export class CardTransferPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    @Inject(forwardRef(() => CheckoutService)) private readonly checkout: CheckoutService,
    private readonly reservations: InventoryReservationService,
  ) {}

  private accountDetails() {
    const raw = this.config.get("CARD_TRANSFER_ACCOUNT_NUMBER", { infer: true });
    const holder = this.config.get("CARD_TRANSFER_ACCOUNT_HOLDER", { infer: true });
    if (!raw || !holder) throw new ValidationApiException({ field: "cardTransfer", reason: "CARD_TRANSFER_NOT_CONFIGURED" });
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8) throw new ValidationApiException({ field: "cardTransfer", reason: "CARD_TRANSFER_CONFIGURATION_INVALID" });
    return { companyCardNumberMasked: `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`, accountHolderName: holder };
  }

  async startForCheckout(userId: string, checkoutId: string, idempotencyKey: string) {
    if (!idempotencyKey?.trim()) throw new ValidationApiException({ field: "idempotencyKey", reason: "REQUIRED" });
    const existing = await this.prisma.cardTransferPayment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const checkout = await this.prisma.checkout.findFirst({ where: { id: checkoutId, userId } });
    if (!checkout) throw new ValidationApiException({ field: "checkoutId", reason: "NOT_FOUND" });
    if (checkout.status !== CheckoutStatus.READY_FOR_PAYMENT && checkout.status !== CheckoutStatus.PAYMENT_PENDING) {
      throw new ValidationApiException({ field: "checkout", reason: "NOT_READY_FOR_PAYMENT" });
    }
    const now = new Date();
    const details = this.accountDetails();
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.inventoryReservation.findFirst({ where: { checkoutId, status: "ACTIVE", expiresAt: { gt: now } } });
      // OF-13's base hold starts at payment, not cart.  PY-02 is the explicit
      // receipt-review exception: once card transfer is selected, the hold
      // survives its 30-minute upload window and, outside working hours,
      // the next working-morning review.
      const reviewAt = nextWorkingReviewAt(now);
      const expiresAt = new Date(Math.max(
        now.getTime() + CARD_TRANSFER_RECEIPT_WINDOW_MS,
        reviewAt.getTime(),
      ));
      if (!active) {
        const lines = checkout.pricedLinesSnapshot as unknown as { sellerOffer: { id: string }; quantity: number }[];
        if (!lines?.length) throw new ValidationApiException({ field: "checkout", reason: "MISSING_PRICED_LINES" });
        for (const line of lines) await this.reservations.reserve(tx, checkoutId, line.sellerOffer.id, line.quantity, expiresAt);
      }
      const row = await tx.cardTransferPayment.create({
        data: { userId, checkoutId, idempotencyKey: idempotencyKey.trim(), expectedAmount: checkout.totalAmount, currency: checkout.currency, ...details, receiptUploadDeadlineAt: new Date(now.getTime() + CARD_TRANSFER_RECEIPT_WINDOW_MS), reviewAvailableAt: reviewAt },
      });
      await tx.checkout.update({ where: { id: checkoutId }, data: { status: CheckoutStatus.PAYMENT_PENDING, expiresAt } });
      return row;
    });
  }

  async startForBooking(userId: string, bookingId: string, idempotencyKey: string) {
    if (!idempotencyKey?.trim()) throw new ValidationApiException({ field: "idempotencyKey", reason: "REQUIRED" });
    const existing = await this.prisma.cardTransferPayment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, userId } });
    if (!booking) throw new ValidationApiException({ field: "bookingId", reason: "NOT_FOUND" });
    if (!cardTransferAllowedForBooking(booking.startAt)) throw new ValidationApiException({ field: "paymentMethod", reason: "CARD_TRANSFER_BOOKING_LESS_THAN_24H" });
    const amount = Number(booking.depositAmount ?? booking.priceAmount);
    if (!Number.isInteger(amount) || amount <= 0) throw new ValidationApiException({ field: "booking", reason: "PAYABLE_AMOUNT_REQUIRED" });
    const now = new Date();
    const details = this.accountDetails();
    const row = await this.prisma.cardTransferPayment.create({
      data: { userId, bookingId, idempotencyKey: idempotencyKey.trim(), expectedAmount: amount, currency: booking.currency ?? "IRR", ...details, receiptUploadDeadlineAt: new Date(now.getTime() + CARD_TRANSFER_RECEIPT_WINDOW_MS), reviewAvailableAt: nextWorkingReviewAt(now) },
    });
    await this.prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: PaymentStatus.PENDING } });
    return row;
  }

  async uploadReceipt(userId: string, id: string, receiptObjectKey: string) {
    const row = await this.prisma.cardTransferPayment.findFirst({ where: { id, userId } });
    if (!row) throw new ValidationApiException({ field: "payment", reason: "NOT_FOUND" });
    if (row.status !== CardTransferPaymentStatus.AWAITING_RECEIPT && row.status !== CardTransferPaymentStatus.UNDERPAID_AWAITING_DIFFERENCE) {
      throw new ValidationApiException({ field: "receipt", reason: "RECEIPT_NOT_ACCEPTED_IN_CURRENT_STATE" });
    }
    if (row.receiptUploadDeadlineAt < new Date() || (row.differenceDueAt && row.differenceDueAt < new Date())) {
      await this.prisma.cardTransferPayment.update({ where: { id }, data: { status: CardTransferPaymentStatus.EXPIRED } });
      throw new ValidationApiException({ field: "receipt", reason: "RECEIPT_UPLOAD_WINDOW_EXPIRED" });
    }
    assertObjectKeyUnder(receiptObjectKey, "card-transfer-receipts", userId);
    return this.prisma.cardTransferPayment.update({ where: { id }, data: { receiptObjectKey, receiptUploadedAt: new Date(), status: CardTransferPaymentStatus.REVIEW_PENDING, reviewAvailableAt: nextWorkingReviewAt(new Date()) } });
  }

  /** Finance review is deliberately unavailable before the queue's working-hours timestamp. */
  async review(adminUserId: string, id: string, receivedAmount: number, approve: boolean, reason?: string) {
    if (!Number.isInteger(receivedAmount) || receivedAmount < 0) throw new ValidationApiException({ field: "receivedAmount", reason: "INTEGER_RIAL_REQUIRED" });
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cardTransferPayment.findUnique({ where: { id } });
      if (!row) throw new ValidationApiException({ field: "payment", reason: "NOT_FOUND" });
      if (row.status !== CardTransferPaymentStatus.REVIEW_PENDING) throw new ValidationApiException({ field: "payment", reason: "NOT_REVIEWABLE" });
      if (row.reviewAvailableAt > now) throw new ValidationApiException({ field: "payment", reason: "REVIEW_AVAILABLE_NEXT_WORKING_HOURS" });
      if (!approve) return tx.cardTransferPayment.update({ where: { id }, data: { status: CardTransferPaymentStatus.REJECTED, receivedAmount, reviewedAt: now, reviewedByAdminId: adminUserId, rejectionReason: reason?.trim() || "REJECTED" } });
      if (receivedAmount < row.expectedAmount) {
        return tx.cardTransferPayment.update({ where: { id }, data: { status: CardTransferPaymentStatus.UNDERPAID_AWAITING_DIFFERENCE, receivedAmount, reviewedAt: now, reviewedByAdminId: adminUserId, differenceDueAt: new Date(now.getTime() + CARD_TRANSFER_UNDERPAYMENT_WINDOW_MS) } });
      }
      await this.ledger.recordBalanced("Card transfer receipt approved", "CARD_TRANSFER", row.id, row.currency, [
        { accountCode: LedgerAccountCode.CARD_TRANSFER_RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount: row.expectedAmount },
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.CREDIT, amount: row.expectedAmount },
      ], tx);
      if (receivedAmount > row.expectedAmount) {
        await this.wallet.credit({ userId: row.userId, balanceType: WalletBalanceType.WITHDRAWABLE, amount: receivedAmount - row.expectedAmount, source: WalletCreditSource.OVERPAYMENT, referenceType: "CARD_TRANSFER_OVERPAYMENT", referenceId: row.id, debitAccount: LedgerAccountCode.CARD_TRANSFER_RECEIVABLE }, tx);
      }
      return tx.cardTransferPayment.update({ where: { id }, data: { status: CardTransferPaymentStatus.APPROVED, receivedAmount, reviewedAt: now, reviewedByAdminId: adminUserId, rejectionReason: null } });
    });
    if (result.status === CardTransferPaymentStatus.APPROVED) {
      if (result.checkoutId) await this.checkout.finalizeSuccessfulPayment(result.checkoutId, false);
      if (result.bookingId) await this.prisma.booking.update({ where: { id: result.bookingId }, data: { paymentStatus: PaymentStatus.PAID } });
    } else if (result.status === CardTransferPaymentStatus.REJECTED && result.checkoutId) {
      await this.prisma.$transaction(async (tx) => {
        await this.reservations.releaseAllForCheckout(tx, result.checkoutId!);
        await tx.checkout.update({ where: { id: result.checkoutId! }, data: { status: CheckoutStatus.READY_FOR_PAYMENT, expiresAt: null } });
      });
    }
    return result;
  }

  /**
   * Deterministic worker hook for expired customer windows.  Under-payments
   * become withdrawable wallet credit (never a silent loss); a plain missing
   * receipt has no captured value and merely releases reserved stock.
   */
  async expireOverdue(now = new Date()): Promise<number> {
    const overdue = await this.prisma.cardTransferPayment.findMany({
      where: { OR: [
        { status: CardTransferPaymentStatus.AWAITING_RECEIPT, receiptUploadDeadlineAt: { lt: now } },
        { status: CardTransferPaymentStatus.UNDERPAID_AWAITING_DIFFERENCE, differenceDueAt: { lt: now } },
      ] },
    });
    for (const row of overdue) {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.cardTransferPayment.findUniqueOrThrow({ where: { id: row.id } });
        if (current.status === CardTransferPaymentStatus.UNDERPAID_AWAITING_DIFFERENCE && current.receivedAmount && current.receivedAmount > 0) {
          await this.wallet.credit({ userId: current.userId, balanceType: WalletBalanceType.WITHDRAWABLE, amount: current.receivedAmount, source: WalletCreditSource.REFUND, referenceType: "CARD_TRANSFER_UNDERPAYMENT_REFUND", referenceId: current.id, debitAccount: LedgerAccountCode.CARD_TRANSFER_RECEIVABLE }, tx);
        }
        await tx.cardTransferPayment.update({ where: { id: current.id }, data: { status: CardTransferPaymentStatus.EXPIRED, rejectionReason: "PAYMENT_WINDOW_EXPIRED" } });
        if (current.checkoutId) {
          await this.reservations.releaseAllForCheckout(tx, current.checkoutId);
          await tx.checkout.update({ where: { id: current.checkoutId }, data: { status: CheckoutStatus.READY_FOR_PAYMENT, expiresAt: null } });
        }
        if (current.bookingId) await tx.booking.update({ where: { id: current.bookingId }, data: { paymentStatus: PaymentStatus.FAILED } });
      });
    }
    return overdue.length;
  }
}
