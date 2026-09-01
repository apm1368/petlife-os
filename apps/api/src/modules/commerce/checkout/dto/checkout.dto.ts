import { DeliveryMethod, PaymentProvider } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

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
  /** Sandbox-only — lets tests/dev deterministically exercise every gateway outcome (DEV_SIMULATED and STANDARD_GATEWAY both accept it; see README "Standard payment behavior"). Never present in a real gateway integration. */
  @IsOptional()
  @IsEnum(["SUCCESS", "FAILURE", "PENDING"])
  mode?: "SUCCESS" | "FAILURE" | "PENDING";
}

export class CreatePaymentIntentDto {
  /** Defaults to DEV_SIMULATED, preserving Handoff 06 behavior exactly when omitted. Must support supportsDirectPayment. */
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;
}

export class CreateFinancingIntentDto {
  /** Must support supportsInstallments (SNAPP_PAY or DIGI_PAY this phase). */
  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;
}

export class SelectFinancingPlanDto {
  @IsString()
  providerPlanId!: string;
}

export class AuthorizeFinancingDto {
  /** Sandbox-only — see PayCheckoutDto's mode for the same pattern. Never present in a real provider integration. */
  @IsOptional()
  @IsEnum(["APPROVE", "DECLINE", "PENDING"])
  mode?: "APPROVE" | "DECLINE" | "PENDING";
}
