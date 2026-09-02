import { DisputeStatus } from "@prisma/client";

/**
 * The authoritative Dispute transition table (spec: "domain outcome and
 * payment/refund state must remain separate... do not collapse these into
 * one status" — this table only ever governs the domain outcome; nothing
 * here touches a Refund). Every resolved-or-rejected outcome (any
 * RESOLVED_CUSTOMER / RESOLVED_PROVIDER / RESOLVED_SELLER /
 * PARTIAL_RESOLUTION / REJECTED status) can only reach CLOSED next — once a
 * dispute is decided, the only remaining step is archival, never a second
 * decision.
 */
export const DISPUTE_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  [DisputeStatus.OPEN]: [DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE, DisputeStatus.REJECTED, DisputeStatus.CLOSED],
  [DisputeStatus.UNDER_REVIEW]: [
    DisputeStatus.AWAITING_EVIDENCE,
    DisputeStatus.RESOLVED_CUSTOMER,
    DisputeStatus.RESOLVED_PROVIDER,
    DisputeStatus.RESOLVED_SELLER,
    DisputeStatus.PARTIAL_RESOLUTION,
    DisputeStatus.REJECTED,
    DisputeStatus.CLOSED,
  ],
  [DisputeStatus.AWAITING_EVIDENCE]: [
    DisputeStatus.UNDER_REVIEW,
    DisputeStatus.RESOLVED_CUSTOMER,
    DisputeStatus.RESOLVED_PROVIDER,
    DisputeStatus.RESOLVED_SELLER,
    DisputeStatus.PARTIAL_RESOLUTION,
    DisputeStatus.REJECTED,
    DisputeStatus.CLOSED,
  ],
  [DisputeStatus.RESOLVED_CUSTOMER]: [DisputeStatus.CLOSED],
  [DisputeStatus.RESOLVED_PROVIDER]: [DisputeStatus.CLOSED],
  [DisputeStatus.RESOLVED_SELLER]: [DisputeStatus.CLOSED],
  [DisputeStatus.PARTIAL_RESOLUTION]: [DisputeStatus.CLOSED],
  [DisputeStatus.REJECTED]: [DisputeStatus.CLOSED],
  [DisputeStatus.CLOSED]: [],
};

export const RESOLVED_DISPUTE_STATUSES: ReadonlySet<DisputeStatus> = new Set([
  DisputeStatus.RESOLVED_CUSTOMER,
  DisputeStatus.RESOLVED_PROVIDER,
  DisputeStatus.RESOLVED_SELLER,
  DisputeStatus.PARTIAL_RESOLUTION,
  DisputeStatus.REJECTED,
]);
