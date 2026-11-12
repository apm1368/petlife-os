import { WalletTopUpRail, WalletTopUpStatus } from "@prisma/client";
import type { AppEnv } from "../../../config/env";

/** Integer rials. 10,000 toman is the smallest top-up worth a bank transfer; 50,000,000 toman caps one request. */
export const WALLET_TOP_UP_MIN_IRR = 100_000;
export const WALLET_TOP_UP_MAX_IRR = 500_000_000;
export const WALLET_TOP_UP_PRESETS_IRR = [500_000, 1_000_000, 2_000_000, 5_000_000];
/** A card-to-card member has a day to send the money and upload the receipt. */
export const WALLET_CARD_RECEIPT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Open requests (not yet credited, rejected, failed, expired or cancelled) one member may hold at once. */
export const WALLET_MAX_OPEN_TOP_UPS = 3;
/** Staff adjustment ceiling per action; larger corrections are split and each carries its own reason. */
export const WALLET_ADJUSTMENT_MAX_IRR = 1_000_000_000;

export const OPEN_TOP_UP_STATUSES: WalletTopUpStatus[] = [
  WalletTopUpStatus.AWAITING_PAYMENT,
  WalletTopUpStatus.AWAITING_RECEIPT,
  WalletTopUpStatus.REVIEW_PENDING,
];

type RailConfig = Pick<
  AppEnv,
  "PAYMENT_SANDBOX_MODE" | "ZIBAL_ENABLED" | "ZIBAL_MERCHANT" | "CARD_TRANSFER_ACCOUNT_NUMBER" | "CARD_TRANSFER_ACCOUNT_HOLDER"
>;

/** The company card, or null when it is not configured well enough to show to a member. */
export function companyCard(config: Pick<RailConfig, "CARD_TRANSFER_ACCOUNT_NUMBER" | "CARD_TRANSFER_ACCOUNT_HOLDER">) {
  const digits = (config.CARD_TRANSFER_ACCOUNT_NUMBER ?? "").replace(/\D/g, "");
  const holder = config.CARD_TRANSFER_ACCOUNT_HOLDER?.trim();
  if (digits.length !== 16 || !holder) return null;
  return {
    cardNumber: digits.replace(/(\d{4})(?=\d)/g, "$1-"),
    cardNumberMasked: `${"•".repeat(12)}${digits.slice(-4)}`,
    cardHolderName: holder,
  };
}

/**
 * Which rails can really take money. Zibal only in production mode with a merchant: in sandbox the gateway's
 * verify always answers "paid", which would mint spendable credit from nothing. There is no simulated rail.
 */
export function availableTopUpRails(config: RailConfig): WalletTopUpRail[] {
  const rails: WalletTopUpRail[] = [];
  if (config.PAYMENT_SANDBOX_MODE === "production" && config.ZIBAL_ENABLED && config.ZIBAL_MERCHANT?.trim()) rails.push(WalletTopUpRail.ZIBAL);
  if (companyCard(config)) rails.push(WalletTopUpRail.CARD_TO_CARD);
  return rails;
}

export function validTopUpAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount >= WALLET_TOP_UP_MIN_IRR && amount <= WALLET_TOP_UP_MAX_IRR;
}

/** An awaiting card-to-card request whose receipt window has passed is expired, whether or not a worker noticed. */
export function isReceiptWindowOver(topUp: { status: WalletTopUpStatus; receiptDeadlineAt: Date | null }, now = new Date()): boolean {
  return topUp.status === WalletTopUpStatus.AWAITING_RECEIPT && !!topUp.receiptDeadlineAt && topUp.receiptDeadlineAt <= now;
}

/** Where Zibal sends the member back. Member pages live under the locale prefix in every language (only the
 * Persian home page is the bare domain), so the return lands directly and no redirect can drop Zibal's query. */
export function walletReturnUrl(webOrigin: string, locale: string): string {
  const origin = webOrigin.split(",")[0]!.trim().replace(/\/$/, "");
  return `${origin}/${["fa", "en", "de", "es"].includes(locale) ? locale : "fa"}/profile/wallet`;
}
