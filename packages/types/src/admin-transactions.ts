/** Admin → Transactions → Explorer: one row per money movement, newest first. */
export type AdminTransactionKind = "PAYMENT" | "REFUND" | "WALLET_TOP_UP" | "WALLET_ADJUSTMENT";

/** What a payment was for, derived from what it is linked to. WALLET covers top-ups and staff corrections. */
export type AdminTransactionPurpose = "ORDER" | "BOOKING" | "STAY" | "SUBSCRIPTION" | "DONATION" | "WALLET" | "OTHER";

export const ADMIN_TRANSACTION_KINDS: readonly AdminTransactionKind[] = ["PAYMENT", "REFUND", "WALLET_TOP_UP", "WALLET_ADJUSTMENT"];
export const ADMIN_TRANSACTION_GATEWAYS = ["ZIBAL", "CARD_TO_CARD", "WALLET", "STAFF", "DEV_SIMULATED", "STANDARD_GATEWAY", "SNAPP_PAY", "DIGI_PAY"] as const;
export type AdminTransactionGateway = (typeof ADMIN_TRANSACTION_GATEWAYS)[number];

export interface AdminTransactionRowDto {
  kind: AdminTransactionKind;
  id: string;
  occurredAt: string;
  /** Integer rials (FE-14). For a top-up, what finance confirmed arrived when known. */
  amountIrr: number;
  currency: string;
  /** IN: money the platform received or a wallet gained; OUT: a refund or a wallet debit. */
  direction: "IN" | "OUT";
  /** The source record's own status (payment, refund or top-up status; CREDIT/DEBIT for a staff correction). */
  status: string;
  gateway: string | null;
  purpose: AdminTransactionPurpose;
  /** Checkout, booking, order or wallet-entry id this row hangs off, for the payment trace. */
  referenceId: string | null;
  person: { id: string; displayName: string; phoneMasked: string | null; emailMasked: string | null } | null;
  /** Only ever the last four digits ("•••• 1234"). */
  cardMasked: string | null;
  productTitles: string[];
}

export interface AdminTransactionPageDto {
  items: AdminTransactionRowDto[];
  /** Pass back as `cursor` for the next (older) page; null on the last page. */
  nextCursor: string | null;
}

export interface AdminTransactionFilters {
  kind?: AdminTransactionKind;
  person?: string;
  product?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  gateway?: AdminTransactionGateway;
  status?: string;
}
