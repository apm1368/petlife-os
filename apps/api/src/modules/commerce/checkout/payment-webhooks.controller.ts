import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { PaymentsService } from "../payments/payments.service";
import { PaymentGatewayRegistry } from "../payments/payment-gateway-registry.service";
import { ProviderEventsService, hashPayload } from "../payments/provider-events.service";
import { PaymentWebhookDto } from "../payments/dto/payment-webhook.dto";
import { FinancingService } from "../financing/financing.service";
import { FinancingProviderRegistry } from "../financing/financing-provider-registry.service";
import { WebhookSignatureInvalidException } from "../../../common/errors/api-exception";

const SLUG_TO_PROVIDER: Record<string, PaymentProvider> = {
  dev_simulated: PaymentProvider.DEV_SIMULATED,
  standard_gateway: PaymentProvider.STANDARD_GATEWAY,
  snapp_pay: PaymentProvider.SNAPP_PAY,
  digi_pay: PaymentProvider.DIGI_PAY,
};

function resolveProviderSlug(slug: string): PaymentProvider {
  const provider = SLUG_TO_PROVIDER[slug];
  if (!provider) throw new BadRequestException("Unsupported payment provider");
  return provider;
}

/**
 * Webhook (authoritative) + callback (UX signal only) endpoints (spec
 * sections 14-18) — deliberately declared alongside CheckoutController
 * rather than inside PaymentsModule/FinancingModule, since this is the one
 * place that needs both PaymentsService and FinancingService together
 * without creating a module import cycle (CheckoutModule already imports
 * both). No SessionAuthGuard on the webhook route — a real gateway calls it
 * unauthenticated, as itself, authenticated only by its own signature
 * header; the callback route is a plain browser GET redirect target, safe
 * by construction since it only ever reads state, never writes it.
 */
@Controller("payments")
export class PaymentWebhooksController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly paymentGateways: PaymentGatewayRegistry,
    private readonly financing: FinancingService,
    private readonly financingProviders: FinancingProviderRegistry,
    private readonly providerEvents: ProviderEventsService,
  ) {}

  @Post("webhooks/:provider")
  async handleWebhook(@Param("provider") providerSlug: string, @Body() dto: PaymentWebhookDto, @Headers("x-webhook-signature") signature?: string) {
    const provider = resolveProviderSlug(providerSlug);
    const isFinancing = Boolean(dto.financingIntentId);

    const verifier = isFinancing ? this.financingProviders.resolve(provider) : this.paymentGateways.resolve(provider);
    if (!verifier.verifyWebhookSignature(dto, signature)) throw new WebhookSignatureInvalidException({ provider: providerSlug });

    const { event, isDuplicate } = await this.providerEvents.recordIfNew({
      provider,
      providerEventId: dto.eventId,
      eventType: dto.eventType ?? (isFinancing ? "financing.status" : "payment.status"),
      paymentIntentId: dto.paymentIntentId,
      financingIntentId: dto.financingIntentId,
      payloadHash: hashPayload(dto),
    });

    if (isDuplicate) {
      // Idempotent by construction (spec sections 15, 18): a second delivery
      // of the same provider event id is acknowledged without touching
      // PaymentIntent/FinancingIntent/Transaction/Order state a second time.
      await this.providerEvents.markIgnoredDuplicate(event.id);
      return { received: true, processed: false, duplicate: true };
    }

    try {
      let processed = false;
      if (dto.paymentIntentId) {
        const outcome = await this.payments.resolvePendingIntent(dto.paymentIntentId, dto.eventId, dto.status);
        processed = outcome !== null;
      } else if (dto.financingIntentId) {
        const outcome = await this.financing.resolveAuthorization(dto.financingIntentId, dto.eventId, dto.status === "SUCCEEDED" ? "APPROVED" : "DECLINED");
        processed = outcome !== null;
      } else {
        throw new BadRequestException("Webhook payload must carry exactly one of paymentIntentId/financingIntentId");
      }
      await this.providerEvents.markProcessed(event.id);
      return { received: true, processed };
    } catch (error) {
      await this.providerEvents.markFailed(event.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Browser return endpoint (spec section 15) — a pure read, never a write.
   * The frontend calls this only to render a "processing/approved/declined"
   * hint immediately after redirect; it must never be treated as
   * confirmation, and the response never confirms Orders itself.
   */
  @Get("callback/:provider")
  async handleCallback(@Param("provider") providerSlug: string, @Query("paymentIntentId") paymentIntentId?: string, @Query("financingIntentId") financingIntentId?: string) {
    resolveProviderSlug(providerSlug);
    if (paymentIntentId) {
      const intent = await this.payments.getIntentById(paymentIntentId);
      return { status: intent?.status ?? "UNKNOWN" };
    }
    if (financingIntentId) {
      const intent = await this.financing.getById(financingIntentId).catch(() => null);
      return { status: intent?.status ?? "UNKNOWN" };
    }
    return { status: "UNKNOWN" };
  }
}
