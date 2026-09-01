import { DeliveryMethod } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsUUID } from "class-validator";

export class CreateCheckoutDto {
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  /** Required (true) when the cart holds a POTENTIAL_SAFETY_CONFLICT line — see SafetyConflictException. */
  @IsOptional()
  @IsBoolean()
  acknowledgeSafetyConflict?: boolean;
}

export class UpdateCheckoutDto {
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;
}

export class PayCheckoutDto {
  /** DEV_SIMULATED only — lets tests/dev deterministically exercise every gateway outcome. Never present in a real gateway integration. */
  @IsOptional()
  @IsEnum(["SUCCESS", "FAILURE", "PENDING"])
  mode?: "SUCCESS" | "FAILURE" | "PENDING";
}
