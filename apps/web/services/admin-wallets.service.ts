import type {
  AdminWalletAdjustmentDto,
  AdminWalletDetailDto,
  AdminWalletListItemDto,
  AdminWalletTopUpDto,
  PaginatedDto,
  WalletAdjustmentDirectionValue,
  WalletAdjustmentReasonCode,
  WalletBalanceTypeValue,
  WalletTopUpStatusValue,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** Back-office member wallets: wallet.view to read, wallet.adjust to correct, wallet.topup.review to settle receipts. */
export const adminWalletsService = {
  list: (q: string | undefined, page = 1, pageSize = 20) => apiFetch<PaginatedDto<AdminWalletListItemDto>>(`/admin/wallets${qs({ q, page, pageSize })}`),
  detail: (userId: string) => apiFetch<AdminWalletDetailDto>(`/admin/wallets/${userId}`),
  adjust: (
    userId: string,
    input: { direction: WalletAdjustmentDirectionValue; balanceType: WalletBalanceTypeValue; amount: number; reasonCode: WalletAdjustmentReasonCode; reason: string; evidenceReference?: string },
    idempotencyKey: string,
  ) => apiFetch<AdminWalletAdjustmentDto>(`/admin/wallets/${userId}/adjustments`, { method: "POST", body: input, idempotencyKey }),
  topUps: (status: WalletTopUpStatusValue | undefined, page = 1, pageSize = 20) =>
    apiFetch<PaginatedDto<AdminWalletTopUpDto>>(`/admin/wallet-top-ups${qs({ status, page, pageSize })}`),
  review: (id: string, input: { approve: boolean; receivedAmount?: number; reason?: string }) =>
    apiFetch<AdminWalletTopUpDto>(`/admin/wallet-top-ups/${id}/review`, { method: "POST", body: input }),
  receiptLink: (id: string) => apiFetch<{ downloadUrl: string; expiresInSeconds: number }>(`/admin/wallet-top-ups/${id}/receipt-link`, { method: "POST" }),
};
