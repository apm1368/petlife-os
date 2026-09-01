import { BadRequestException, Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentWebhookDto } from "./dto/payment-webhook.dto";
import { DevWebhookSignatureVerifier } from "./webhook-signature.verifier";

/**
 * No SessionAuthGuard here on purpose — a real gateway calls this
 * unauthenticated (as itself, not as any PET LIFE OS user), authenticated
 * only by the signature header (spec section 41). Only `dev_simulated` is
 * ever a valid `:provider` value this phase.
 */
@Controller("payments/webhooks")
export class PaymentsController {
  private readonly signatureVerifier = new DevWebhookSignatureVerifier();

  constructor(private readonly payments: PaymentsService) {}

  @Post(":provider")
  async handleWebhook(@Param("provider") provider: string, @Body() dto: PaymentWebhookDto, @Headers("x-webhook-signature") signature?: string) {
    if (provider !== "dev_simulated") throw new BadRequestException("Unsupported payment provider");
    if (!this.signatureVerifier.verify(dto, signature)) throw new BadRequestException("Invalid webhook signature");

    const outcome = await this.payments.resolvePendingIntent(dto.paymentIntentId, dto.eventId, dto.status);
    return { received: true, processed: outcome !== null };
  }
}
