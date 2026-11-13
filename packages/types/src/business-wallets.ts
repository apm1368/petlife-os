import type { AdminWalletTopUpDto, WalletBalancesDto, WalletBalanceTypeValue, WalletEntryDto } from "./index";

/** One wallet per account: a member's own wallet, or one business wallet per seller or provider organisation. */
export type WalletOwnerTypeValue = "MEMBER" | "SELLER" | "PROVIDER";

export interface WalletOwnerDto {
  walletAccountId: string;
  type: WalletOwnerTypeValue;
  /** The member's user id, or the organisation's id. */
  ownerId: string;
  /** The member's display name or the organisation's name. */
  name: string;
}

/** A business wallet the signed-in member manages (seller OWNER/ADMIN/FINANCE, provider OWNER). */
export interface BusinessWalletDto {
  owner: WalletOwnerDto;
  role: string;
  balances: WalletBalancesDto;
}

/**
 * Why staff move credit between two wallets. Between wallets with no common owner (a member and an organisation they
 * belong to count as related) only WALLET_TRANSFER_UNRELATED_REASON_CODES are allowed.
 */
export const WALLET_TRANSFER_REASON_CODES = [
  "OWNER_REQUEST",
  "ACCOUNT_CONSOLIDATION",
  "PAYMENT_CORRECTION",
  "REFUND",
  "MISDIRECTED_PAYMENT",
  "ACCOUNT_SUCCESSION",
  "LEGAL_ORDER",
] as const;
/** REVERSAL is set by the server on a reversal request (it cannot be chosen for a new transfer). */
export type WalletTransferReasonCode = (typeof WALLET_TRANSFER_REASON_CODES)[number] | "REVERSAL";
export const WALLET_TRANSFER_UNRELATED_REASON_CODES: readonly WalletTransferReasonCode[] = ["REFUND", "MISDIRECTED_PAYMENT", "ACCOUNT_SUCCESSION", "LEGAL_ORDER", "REVERSAL"];
/** The only reasons that may move credit INTO the wallet of an organisation that is not VERIFIED (QA, 2026-11-13). */
export const WALLET_TRANSFER_REFUND_REASON_CODES: readonly WalletTransferReasonCode[] = ["REFUND", "REVERSAL"];
/** Largest single staff transfer, integer rials (50,000,000 toman). */
export const WALLET_TRANSFER_MAX_IRR = 500_000_000;

export interface AdminWalletAccountDto {
  owner: WalletOwnerDto;
  balances: WalletBalancesDto;
  lastActivityAt: string | null;
}

export interface AdminWalletTransferDto {
  id: string;
  from: WalletOwnerDto;
  to: WalletOwnerDto;
  balanceType: WalletBalanceTypeValue;
  amount: number;
  reasonCode: WalletTransferReasonCode;
  note: string;
  evidenceReference: string;
  /** Whether the two wallets shared an owner when requested. */
  related: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  /** On a reversal: the transfer it sends back. */
  reversesTransferId: string | null;
  /** On an approved transfer: its live (pending or approved) reversal, if any. */
  reversalId: string | null;
  requestedBy: { adminUserId: string; displayName: string };
  decidedBy: { adminUserId: string; displayName: string } | null;
  decidedAt: string | null;
  decisionReason: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface AdminWalletAccountDetailDto {
  account: AdminWalletAccountDto;
  entries: WalletEntryDto[];
  topUps: AdminWalletTopUpDto[];
  transfers: AdminWalletTransferDto[];
}

export interface AdminWalletTransferInput {
  from: { type: WalletOwnerTypeValue; id: string };
  to: { type: WalletOwnerTypeValue; id: string };
  balanceType: WalletBalanceTypeValue;
  /** Integer rials. */
  amount: number;
  reasonCode: WalletTransferReasonCode;
  note: string;
  evidenceReference: string;
}
