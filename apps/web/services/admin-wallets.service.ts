import type {
  AdminWalletAccountDetailDto,
  AdminWalletAccountDto,
  AdminWalletTransferDto,
  AdminWalletTransferInput,
  WalletOwnerTypeValue,
  AdminCardTransferDestinationOverviewDto,
  AdminCardTransferPaymentDto,
  CardTransferPaymentStatusValue,
  AdminWalletAdjustmentRequestDto,
  AdminWalletDetailDto,
  AdminWalletListItemDto,
  AdminWalletTopUpDto,
  PaginatedDto,
  WalletAdjustmentDirectionValue,
  WalletAdjustmentReasonCode,
  WalletAdjustmentRequestStatusValue,
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

/**
 * Back-office member wallets: wallet.view to read, wallet.topup.review to settle receipts. A correction is a request
 * by one wallet.adjust admin that a different wallet.adjust admin approves before anything is posted (FE-16).
 */
export const adminWalletsService = {
  list: (q: string | undefined, page = 1, pageSize = 20) => apiFetch<PaginatedDto<AdminWalletListItemDto>>(`/admin/wallets${qs({ q, page, pageSize })}`),
  // Every kind of wallet (member, seller organisation, provider organisation) and two-person transfers between them.
  accounts: (type: WalletOwnerTypeValue, q: string | undefined, page = 1, pageSize = 20) =>
    apiFetch<PaginatedDto<AdminWalletAccountDto>>(`/admin/wallet-accounts${qs({ type, q, page, pageSize })}`),
  account: (id: string) => apiFetch<AdminWalletAccountDetailDto>(`/admin/wallet-accounts/${encodeURIComponent(id)}`),
  transfers: (query: { status?: WalletAdjustmentRequestStatusValue; walletAccountId?: string; page?: number; pageSize?: number } = {}) =>
    apiFetch<PaginatedDto<AdminWalletTransferDto>>(`/admin/wallet-transfers${qs({ status: query.status, walletAccountId: query.walletAccountId, page: query.page ?? 1, pageSize: query.pageSize ?? 20 })}`),
  requestTransfer: (input: AdminWalletTransferInput, idempotencyKey: string) =>
    apiFetch<AdminWalletTransferDto>("/admin/wallet-transfers", { method: "POST", body: input, idempotencyKey }),
  approveTransfer: (id: string) => apiFetch<AdminWalletTransferDto>(`/admin/wallet-transfers/${encodeURIComponent(id)}/approve`, { method: "POST", body: {} }),
  rejectTransfer: (id: string, reason: string) => apiFetch<AdminWalletTransferDto>(`/admin/wallet-transfers/${encodeURIComponent(id)}/reject`, { method: "POST", body: { reason } }),
  reverseTransfer: (id: string, input: { note: string; evidenceReference: string }) =>
    apiFetch<AdminWalletTransferDto>(`/admin/wallet-transfers/${encodeURIComponent(id)}/reverse`, { method: "POST", body: input }),
  detail: (userId: string) => apiFetch<AdminWalletDetailDto>(`/admin/wallets/${userId}`),
  requestAdjustment: (
    userId: string,
    input: { direction: WalletAdjustmentDirectionValue; balanceType: WalletBalanceTypeValue; amount: number; reasonCode: WalletAdjustmentReasonCode; reason: string; evidenceReference?: string },
    idempotencyKey: string,
  ) => apiFetch<AdminWalletAdjustmentRequestDto>(`/admin/wallets/${userId}/adjustment-requests`, { method: "POST", body: input, idempotencyKey }),
  adjustmentRequests: (query: { status?: WalletAdjustmentRequestStatusValue; userId?: string; page?: number; pageSize?: number } = {}) =>
    apiFetch<PaginatedDto<AdminWalletAdjustmentRequestDto>>(`/admin/wallet-adjustment-requests${qs({ status: query.status, userId: query.userId, page: query.page ?? 1, pageSize: query.pageSize ?? 20 })}`),
  approveAdjustment: (id: string) => apiFetch<AdminWalletAdjustmentRequestDto>(`/admin/wallet-adjustment-requests/${id}/approve`, { method: "PATCH" }),
  rejectAdjustment: (id: string, reason: string) => apiFetch<AdminWalletAdjustmentRequestDto>(`/admin/wallet-adjustment-requests/${id}/reject`, { method: "PATCH", body: { reason } }),
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
