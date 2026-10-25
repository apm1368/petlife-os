/** Internal evidence policy, not an official identity/licence lookup or legal certification. */
export const VERIFICATION_POLICY_VERSION = "2026-10-24.1";
export const WAVE2_VERIFICATION_POLICY_VERSION = "2026-10-25.1";
type DocumentKind = "LICENSE" | "IDENTITY" | "BUSINESS_REGISTRATION" | "BANK_INFO" | "OTHER" | "NATIONAL_ID_CARD" | "BUSINESS_LICENSE" | "ENAMAD";
interface Evidence { kind: DocumentKind; status: string; expiresAt: Date | null }
interface ProfileEvidence { firstName?: string | null; lastName?: string | null; landline?: string | null; mobile?: string | null; mobileVerifiedAt?: Date | null; enamadId?: string | null }
export interface VerificationPolicyOptions { strict: boolean; profile?: ProfileEvidence | null }

export const matchesVerificationEvidence = (required: DocumentKind, actual: DocumentKind) =>
  required === actual || (required === "IDENTITY" && actual === "NATIONAL_ID_CARD");

export function verificationPolicy(kind: string, offersVeterinaryServices = false, strict = false) {
  const clinical = offersVeterinaryServices || ["VET_CLINIC", "VET_HOSPITAL", "VETERINARIAN"].includes(kind);
  return {
    version: strict ? WAVE2_VERIFICATION_POLICY_VERSION : VERIFICATION_POLICY_VERSION,
    mode: "MANUAL_DOCUMENT_REVIEW" as const,
    officialLookup: "NOT_CONNECTED" as const,
    requiredDocumentKinds: (strict ? ["NATIONAL_ID_CARD", "BUSINESS_LICENSE", ...(clinical ? ["LICENSE"] : [])] : clinical ? ["IDENTITY", "LICENSE"] : ["IDENTITY"]) as DocumentKind[],
    requiresBusinessEvidence: strict,
    requiredProfileFields: strict ? ["firstName", "lastName", "landline", "mobile", "mobileVerifiedAt"] : [],
  };
}

export function evaluateVerificationPolicy(kind: string, documents: Evidence[], now = new Date(), offersVeterinaryServices = false, options: VerificationPolicyOptions = { strict: false }) {
  const policy = verificationPolicy(kind, offersVeterinaryServices, options.strict);
  const current = (d: Evidence) => d.expiresAt === null || (Number.isFinite(d.expiresAt.getTime()) && d.expiresAt > now);
  const covers = (required: DocumentKind, pending: boolean) => {
    if (options.strict && required === "BUSINESS_LICENSE" && options.profile?.enamadId?.trim()) return true;
    return documents.some(d =>
      (matchesVerificationEvidence(required, d.kind) || (options.strict && required === "BUSINESS_LICENSE" && d.kind === "ENAMAD")) && current(d) && (d.status === "ACCEPTED" || (pending && d.status === "PENDING")));
  };
  const missingProfileFields = policy.requiredProfileFields.filter(field => {
    const value = options.profile?.[field as keyof ProfileEvidence];
    if (field === "mobileVerifiedAt") return !(value instanceof Date) || !Number.isFinite(value.getTime()) || value > now;
    if (field === "mobile") return typeof value !== "string" || !/^\+[1-9]\d{7,14}$/.test(value);
    return typeof value !== "string" || !value.trim();
  });
  return {
    ...policy,
    missingProfileFields,
    missingForSubmission: policy.requiredDocumentKinds.filter(k => !covers(k, true)),
    missingForApproval: policy.requiredDocumentKinds.filter(k => !covers(k, false)),
  };
}
