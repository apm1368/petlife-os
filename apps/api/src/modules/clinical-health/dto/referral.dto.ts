import { IsEnum, IsOptional, IsString, IsUUID, Length, ValidateIf } from "class-validator";
import { ReferralStatus } from "@petlife/types";

export class CreateReferralDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  /** Exactly one of toProviderOrganizationId (in-system) or externalProviderName (external) should be set — enforced in ReferralService, not here, since the class-validator layer only checks the request shape. */
  @IsOptional()
  @IsUUID()
  toProviderOrganizationId?: string;

  @ValidateIf((o: CreateReferralDto) => !o.toProviderOrganizationId)
  @IsString()
  @Length(1, 200)
  externalProviderName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  externalSpecialty?: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

export class UpdateReferralStatusDto {
  /** Required so PetAccessGuard (route-agnostic of the referral's own id) can authorize this action — ReferralService double-checks it against the referral's actual petId. */
  @IsUUID()
  petId!: string;

  @IsEnum(ReferralStatus)
  status!: ReferralStatus;
}
