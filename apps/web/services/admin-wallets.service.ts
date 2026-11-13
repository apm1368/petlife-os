import type {
  AdminCardTransferDestinationOverviewDto,
  AdminCardTransferPaymentDto,
  CardTransferPaymentStatusValue,
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
  // The company card-to-card account: masked for wallet.view; proposing, approving, rejecting and switching off for
  // SUPER_ADMIN + settings.manage only. A proposal takes effect only when a different super admin approves it (BO-14).
  cardDestination: () => apiFetch<AdminCardTransferDestinationOverviewDto>("/admin/finance/card-transfer-destination"),
  changeCardDestination: (input: { cardNumber?: string; sheba?: string; holderName: string; bankName?: string; reason: string }) =>
    apiFetch<AdminCardTransferDestinationOverviewDto>("/admin/finance/card-transfer-destination", { method: "PUT", body: input }),
  approveCardDestination: (id: string) =>
    apiFetch<AdminCardTransferDestinationOverviewDto>(`/admin/finance/card-transfer-destination/pending/${encodeURIComponent(id)}/approve`, { method: "POST", body: {} }),
  rejectCardDestination: (id: string, reason: string) =>
    apiFetch<AdminCardTransferDestinationOverviewDto>(`/admin/finance/card-transfer-destination/pending/${encodeURIComponent(id)}/reject`, { method: "POST", body: { reason } }),
  deactivateCardDestination: (reason: string) =>
    apiFetch<AdminCardTransferDestinationOverviewDto>("/admin/finance/card-transfer-destination/deactivate", { method: "POST", body: { reason } }),
  // Card-to-card receipts for orders and bookings: finance.view to read, finance.refund.execute to review.
  cardReceipts: (status: CardTransferPaymentStatusValue | "ALL" = "REVIEW_PENDING", page = 1, pageSize = 20) =>
    apiFetch<PaginatedDto<AdminCardTransferPaymentDto>>(`/admin/card-transfer-payments${qs({ status, page, pageSize })}`),
  cardReceiptLink: (id: string) => apiFetch<{ downloadUrl: string; expiresInSeconds: number }>(`/admin/card-transfer-payments/${id}/receipt-link`, { method: "POST" }),
  reviewCardReceipt: (id: string, input: { approve: boolean; receivedAmount: number; reason?: string }) =>
    apiFetch<{ id: string; status: string }>(`/admin/card-transfer-payments/${id}/review`, { method: "POST", body: input }),
};
