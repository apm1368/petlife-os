import { TrustCaseStatus } from "@prisma/client";

/** The authoritative TrustCase transition table — mirrors SupportCase/Dispute's own centralized-validation shape. */
export const TRUST_CASE_TRANSITIONS: Record<TrustCaseStatus, TrustCaseStatus[]> = {
  [TrustCaseStatus.OPEN]: [TrustCaseStatus.UNDER_REVIEW, TrustCaseStatus.CLOSED],
  [TrustCaseStatus.UNDER_REVIEW]: [TrustCaseStatus.RESOLVED, TrustCaseStatus.CLOSED],
  [TrustCaseStatus.RESOLVED]: [TrustCaseStatus.CLOSED],
  [TrustCaseStatus.CLOSED]: [],
};
