import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { CheckoutService } from "./checkout.service";

/**
 * Webhook-driven BNPL confirmation — the exact same `viaWebhook` guard
 * PaymentEventsListener uses, for the exact same reason (spec section 15:
 * "webhook authoritative", and avoiding the sync-vs-async race documented
 * on PaymentEventsListener). `authorizeFinancing()`'s own synchronous path
 * already calls `finalizeSuccessfulPayment` directly when the sandbox
 * `mode` resolves to APPROVED immediately; this listener only ever fires
 * for a `FinancingApproved` event carrying `viaWebhook: true`, i.e. an
 * intent that was left AUTHORIZATION_PENDING and resolved later.
 */
@Injectable()
export class FinancingEventsListener {
  private readonly logger = new Logger(FinancingEventsListener.name);

  constructor(private readonly checkout: CheckoutService) {}

  @OnEvent("FinancingApproved")
  async onFinancingApproved(payload: { checkoutId: string; viaWebhook?: boolean }): Promise<void> {
    if (!payload.viaWebhook) return;
    try {
      await this.checkout.finalizeSuccessfulPayment(payload.checkoutId);
    } catch (error) {
      this.logger.error(`Failed to finalize checkout ${payload.checkoutId} after FinancingApproved`, error instanceof Error ? error.stack : undefined);
    }
  }
}
