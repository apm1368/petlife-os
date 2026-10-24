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
