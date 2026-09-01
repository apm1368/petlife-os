import { IsEnum, IsString, IsUUID } from "class-validator";

export class PaymentWebhookDto {
  @IsUUID()
  paymentIntentId!: string;

  /** The gateway's own event identifier — stored on the resolving PaymentAttempt for traceability, and the basis for idempotent-retry safety. */
  @IsString()
  eventId!: string;

  @IsEnum(["SUCCEEDED", "FAILED"])
  status!: "SUCCEEDED" | "FAILED";
}
