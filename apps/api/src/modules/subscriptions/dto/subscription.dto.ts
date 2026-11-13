import { SubscriptionBillingInterval } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

/** Gift codes are short Latin codes; anything else is refused before any lookup. */
const GIFT_CODE = /^\s*[A-Za-z0-9-]{1,24}\s*$/;

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

  /** The first-purchase gift code, when the member applied one. Checked on the server; never trusted. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(GIFT_CODE)
  giftCode?: string;
}

export class GiftCodeCheckDto {
  @IsString()
  @MaxLength(40)
  @Matches(GIFT_CODE)
  code!: string;
}

export class StartTrialDto {
  @IsUUID()
  planId!: string;
}

export class ScheduleDowngradeDto {
  @IsUUID()
  planId!: string;
}
