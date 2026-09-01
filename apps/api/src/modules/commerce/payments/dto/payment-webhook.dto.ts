import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

/**
 * A single combined shape for both payment and financing webhook deliveries
 * (spec sections 15-18) — exactly one of `paymentIntentId`/`financingIntentId`
 * is set, routing the event to PaymentsService.resolvePendingIntent or
 * FinancingService.resolveAuthorization respectively. `eventId` is the
 * provider's own event identifier — the basis of the
 * `@@unique([provider, providerEventId])` duplicate-delivery guard on
 * PaymentProviderEvent, checked before either resolver ever runs.
 */
export class PaymentWebhookDto {
  @IsOptional()
  @IsUUID()
  paymentIntentId?: string;

  @IsOptional()
  @IsUUID()
  financingIntentId?: string;

  @IsString()
  eventId!: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsEnum(["SUCCEEDED", "FAILED"])
  status!: "SUCCEEDED" | "FAILED";
}
