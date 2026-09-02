import { SupportCaseStatus } from "@prisma/client";

/**
 * The authoritative SupportCase transition table (spec: "no arbitrary
 * status PATCH... centralized transition validation"). RESOLVED and CLOSED
 * both remain reachable from every open working state so an admin can
 * close a case without first walking it through every intermediate status;
 * CLOSED can be reopened to IN_PROGRESS (a customer following up on an
 * already-closed case is common), so it is deliberately not terminal the
 * way Fulfillment/Shipment statuses are.
 */
export const SUPPORT_CASE_TRANSITIONS: Record<SupportCaseStatus, SupportCaseStatus[]> = {
  [SupportCaseStatus.OPEN]: [SupportCaseStatus.IN_PROGRESS, SupportCaseStatus.WAITING_ON_USER, SupportCaseStatus.WAITING_ON_INTERNAL, SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED],
  [SupportCaseStatus.IN_PROGRESS]: [SupportCaseStatus.WAITING_ON_USER, SupportCaseStatus.WAITING_ON_INTERNAL, SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED],
  [SupportCaseStatus.WAITING_ON_USER]: [SupportCaseStatus.IN_PROGRESS, SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED],
  [SupportCaseStatus.WAITING_ON_INTERNAL]: [SupportCaseStatus.IN_PROGRESS, SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED],
  [SupportCaseStatus.RESOLVED]: [SupportCaseStatus.CLOSED, SupportCaseStatus.IN_PROGRESS],
  [SupportCaseStatus.CLOSED]: [SupportCaseStatus.IN_PROGRESS],
};
