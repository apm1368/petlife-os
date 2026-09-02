import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { SellerMembershipRole } from "@prisma/client";

/**
 * "Acceptable to create a dev/local invite flow" (spec section 48) — no
 * email/SMS delivery infrastructure exists, so inviting requires the
 * invitee to already have a PET LIFE OS account (looked up by email or
 * phone) and the membership becomes ACTIVE immediately rather than sitting
 * in a PENDING/accept-link flow nobody could ever complete. This is
 * documented as a known simplification in the README.
 */
export class InviteSellerMemberDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(SellerMembershipRole)
  role!: SellerMembershipRole;
}

export class UpdateSellerMemberDto {
  @IsEnum(SellerMembershipRole)
  role!: SellerMembershipRole;
}
