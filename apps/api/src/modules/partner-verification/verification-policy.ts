/** Internal evidence policy, not an official identity/licence lookup or legal certification. */
export const VERIFICATION_POLICY_VERSION = "2026-10-24.1";
type DocumentKind = "LICENSE" | "IDENTITY" | "BUSINESS_REGISTRATION" | "BANK_INFO" | "OTHER" | "NATIONAL_ID_CARD" | "BUSINESS_LICENSE" | "ENAMAD";
interface Evidence { kind: DocumentKind; status: string; expiresAt: Date | null }

export const matchesVerificationEvidence = (required: DocumentKind, actual: DocumentKind) =>
  required === actual || (required === "IDENTITY" && actual === "NATIONAL_ID_CARD");

export function verificationPolicy(kind: string, offersVeterinaryServices = false) {
  const clinical = offersVeterinaryServices || ["VET_CLINIC", "VET_HOSPITAL", "VETERINARIAN"].includes(kind);
  return {
    version: VERIFICATION_POLICY_VERSION,
    mode: "MANUAL_DOCUMENT_REVIEW" as const,
    officialLookup: "NOT_CONNECTED" as const,
    requiredDocumentKinds: (clinical ? ["IDENTITY", "LICENSE"] : ["IDENTITY"]) as DocumentKind[],
  };
}

export function evaluateVerificationPolicy(kind: string, documents: Evidence[], now = new Date(), offersVeterinaryServices = false) {
  const policy = verificationPolicy(kind, offersVeterinaryServices);
  const current = (d: Evidence) => d.expiresAt === null || (Number.isFinite(d.expiresAt.getTime()) && d.expiresAt > now);
  const covers = (required: DocumentKind, pending: boolean) => documents.some(d =>
    matchesVerificationEvidence(required, d.kind) && current(d) && (d.status === "ACCEPTED" || (pending && d.status === "PENDING")));
  return {
    ...policy,
    missingForSubmission: policy.requiredDocumentKinds.filter(k => !covers(k, true)),
    missingForApproval: policy.requiredDocumentKinds.filter(k => !covers(k, false)),
  };
}
