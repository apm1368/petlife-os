import { Injectable, Logger } from "@nestjs/common";
import { CardTransferPaymentStatus, NotificationCategory, NotificationPriority, WalletTopUpStatus, type CardTransferPayment, type WalletTopUp } from "@prisma/client";
import { createHash } from "node:crypto";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";

/** A stable UUID-shaped id per review outcome, so a retried call never sends the member a second notice. */
export function reviewEventId(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const toman = (rial: number | null | undefined) => Math.round((rial ?? 0) / 10).toLocaleString("en-US");

/**
 * Tells members how finance decided on their card-to-card receipt, for wallet top-ups and for order/booking
 * payments. Until now a member only found out by checking the page again.
 */
@Injectable()
export class ReceiptReviewNotifier {
  private readonly logger = new Logger(ReceiptReviewNotifier.name);

  constructor(private readonly notifications: NotificationOrchestratorService) {}

  private async send(userId: string, type: string, eventKey: string, entityType: string, entityId: string, deepLink: string, templateParams: Record<string, string>) {
    try {
      await this.notifications.notify({ userId, type, category: NotificationCategory.PAYMENT, priority: NotificationPriority.HIGH, templateParams, deepLink, entityType, entityId, domainEventId: reviewEventId(eventKey) });
    } catch (error) {
      this.logger.error(`Receipt review notice ${type} for ${entityId} failed`, error instanceof Error ? error.stack : undefined);
    }
  }

  async topUpReviewed(row: Pick<WalletTopUp, "id" | "userId" | "status" | "amount" | "receivedAmount" | "rejectionReason"> & { walletAccountId?: string | null }) {
    // A business top-up's notice opens that organisation's wallet page, not the member's own.
    const page = row.walletAccountId ? `/profile/wallet/business/${row.walletAccountId}` : "/profile/wallet";
    if (row.status === WalletTopUpStatus.CREDITED) {
      await this.send(row.userId, "wallet.top_up_credited", `wallet-top-up:${row.id}:CREDITED`, "WalletTopUp", row.id, page, { amount: toman(row.receivedAmount ?? row.amount) });
    } else if (row.status === WalletTopUpStatus.REJECTED) {
      await this.send(row.userId, "wallet.top_up_rejected", `wallet-top-up:${row.id}:REJECTED`, "WalletTopUp", row.id, page, { amount: toman(row.amount), reason: row.rejectionReason ?? "—" });
    }
  }

  async cardPaymentReviewed(row: Pick<CardTransferPayment, "id" | "userId" | "status" | "expectedAmount" | "receivedAmount" | "rejectionReason" | "bookingId" | "checkoutId">) {
    const deepLink = row.bookingId ? `/bookings/${row.bookingId}` : "/orders";
    const key = `card-transfer:${row.id}:${row.status}:${row.receivedAmount ?? 0}`;
    if (row.status === CardTransferPaymentStatus.APPROVED) {
      await this.send(row.userId, "payment.card_transfer_approved", key, "CardTransferPayment", row.id, deepLink, { amount: toman(row.expectedAmount) });
    } else if (row.status === CardTransferPaymentStatus.REJECTED) {
      await this.send(row.userId, "payment.card_transfer_rejected", key, "CardTransferPayment", row.id, deepLink, { amount: toman(row.expectedAmount), reason: row.rejectionReason ?? "—" });
    } else if (row.status === CardTransferPaymentStatus.UNDERPAID_AWAITING_DIFFERENCE) {
      await this.send(row.userId, "payment.card_transfer_underpaid", key, "CardTransferPayment", row.id, deepLink, { received: toman(row.receivedAmount), difference: toman(row.expectedAmount - (row.receivedAmount ?? 0)) });
    }
  }
}
