import { IsEnum, IsIn, IsOptional } from "class-validator";
import { PaymentProvider } from "@prisma/client";

/** Same contract as PayCheckoutDto: the registry refuses a disabled provider (DEV_SIMULATED is refused in production). */
export class PayBookingDto {
  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  /** Sandbox-only outcome control for the simulated gateway; ignored by real gateways. */
  @IsOptional()
  @IsIn(["SUCCESS", "FAILURE", "PENDING"])
  mode?: "SUCCESS" | "FAILURE" | "PENDING";
}
