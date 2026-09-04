import { SubscriptionBillingInterval } from "@prisma/client";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

export class SubscribeDto {
  @IsUUID()
  planId!: string;

  @IsEnum(SubscriptionBillingInterval)
  billingInterval!: SubscriptionBillingInterval;

  /**
   * Sandbox-only — see PayCheckoutDto's own mode for the same pattern
   * (Handoff 07). Deliberately excludes "PENDING": subscription billing
   * never uses the webhook-driven `resolvePendingIntent()` path (see
   * SubscriptionBillingService's own doc comment on why), so a PENDING
   * outcome here would have no way to ever resolve — never present in a
   * real gateway integration either way.
   */
  @IsOptional()
  @IsEnum(["SUCCESS", "FAILURE"])
  mode?: "SUCCESS" | "FAILURE";
}

export class StartTrialDto {
  @IsUUID()
  planId!: string;
}

export class ScheduleDowngradeDto {
  @IsUUID()
  planId!: string;
}
