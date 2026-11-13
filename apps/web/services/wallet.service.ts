import type {
  BusinessWalletDto,
  WalletEntryPageDto,
  WalletReceiptUploadTargetDto,
  WalletSummaryDto,
  WalletTopUpDto,
  WalletTopUpRailValue,
  WalletTopUpStartedDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** The signed-in member's own wallet (GET/POST /wallet…). Amounts are integer rials; the UI shows Toman. */
export const walletService = {
  summary: () => apiFetch<WalletSummaryDto>("/wallet"),
  entries: (cursor?: string, limit = 25) =>
    apiFetch<WalletEntryPageDto>(`/wallet/entries?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) }).toString()}`),
  topUps: () => apiFetch<WalletTopUpDto[]>("/wallet/top-ups"),
  topUp: (id: string) => apiFetch<WalletTopUpStartedDto>(`/wallet/top-ups/${id}`),
  startTopUp: (input: { amount: number; rail: WalletTopUpRailValue; locale: string }, idempotencyKey: string) =>
    apiFetch<WalletTopUpStartedDto>("/wallet/top-ups", { method: "POST", body: input, idempotencyKey }),
  verifyZibal: (trackId: string) => apiFetch<WalletTopUpDto>("/wallet/top-ups/zibal/verify", { method: "POST", body: { trackId } }),
  receiptUploadTarget: (id: string, file: { contentType: string; fileSizeBytes: number }) =>
    apiFetch<WalletReceiptUploadTargetDto>(`/wallet/top-ups/${id}/receipt-upload`, { method: "POST", body: file }),
  submitReceipt: (id: string, objectKey: string) => apiFetch<WalletTopUpDto>(`/wallet/top-ups/${id}/receipt`, { method: "POST", body: { objectKey } }),
  cancel: (id: string) => apiFetch<WalletTopUpDto>(`/wallet/top-ups/${id}/cancel`, { method: "POST" }),
};

/** The partner business wallets the member manages (seller OWNER/ADMIN/FINANCE, provider OWNER). */
export const businessWalletsService = {
  list: () => apiFetch<BusinessWalletDto[]>("/wallet/business"),
};

/**
 * One business wallet, with the same shape as the member's own wallet API. Receipts, cancelling and the Zibal return
 * are per top-up (walletService), whichever wallet the top-up is for.
 */
export function businessWalletService(accountId: string) {
  const base = `/wallet/accounts/${encodeURIComponent(accountId)}`;
  return {
    summary: () => apiFetch<WalletSummaryDto>(base),
    entries: (cursor?: string, limit = 25) =>
      apiFetch<WalletEntryPageDto>(`${base}/entries?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) }).toString()}`),
    topUps: () => apiFetch<WalletTopUpDto[]>(`${base}/top-ups`),
    startTopUp: (input: { amount: number; rail: WalletTopUpRailValue; locale: string }, idempotencyKey: string) =>
      apiFetch<WalletTopUpStartedDto>(`${base}/top-ups`, { method: "POST", body: input, idempotencyKey }),
  };
}
