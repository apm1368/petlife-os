import { HttpStatus, SetMetadata } from "@nestjs/common";
import { ApiException } from "../errors/api-exception";

export const VERIFIED_PARTNER_KEY = "requiresVerifiedPartner";
export const RequireVerifiedPartner = () => SetMetadata(VERIFIED_PARTNER_KEY, true);

/** Fail closed for every pending, rejected or suspended verification state. */
export function assertPartnerVerified(verificationStatus: string): void {
  if (verificationStatus !== "VERIFIED") {
    throw new ApiException("PARTNER_NOT_VERIFIED", "Partner verification is required for this action.", HttpStatus.FORBIDDEN, { verificationStatus });
  }
}
