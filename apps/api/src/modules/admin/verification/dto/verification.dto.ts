import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { ProviderVerificationStatus, SellerVerificationStatus } from "@prisma/client";

export class TransitionProviderVerificationDto {
  @IsEnum(ProviderVerificationStatus)
  status!: ProviderVerificationStatus;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class TransitionSellerVerificationDto {
  @IsEnum(SellerVerificationStatus)
  status!: SellerVerificationStatus;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
