export interface PartnerVerificationProfileInput {
  firstName: string;
  lastName: string;
  landline: string;
  websiteUrl?: string;
  enamadId?: string;
}

/** Private: only organization owners/managers and authorized verification admins. */
export interface PartnerVerificationProfileDto extends PartnerVerificationProfileInput {
  mobile: string;
  mobileVerifiedAt: string;
  updatedAt: string;
}

export type PartnerVerificationDocumentKind = "LICENSE" | "IDENTITY" | "BUSINESS_REGISTRATION" | "BANK_INFO" | "OTHER" | "NATIONAL_ID_CARD" | "BUSINESS_LICENSE" | "ENAMAD";
export interface PartnerVerificationPolicyDto {
  version: string;
  mode: "MANUAL_DOCUMENT_REVIEW";
  officialLookup: "NOT_CONNECTED";
  requiredDocumentKinds: PartnerVerificationDocumentKind[];
  missingForSubmission: PartnerVerificationDocumentKind[];
  missingForApproval: PartnerVerificationDocumentKind[];
  requiresBusinessEvidence?: boolean;
  requiredProfileFields?: string[];
  missingProfileFields?: string[];
}
