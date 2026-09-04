import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { CheckoutService } from "./checkout.service";

/**
 * Reacts only to a *webhook-driven* `PaymentSucceeded` (spec section 40's
 * "future-safe async confirmation" for a PAYMENT_PENDING checkout resolved
 * later by PaymentsService.resolvePendingIntent) — never to one published
 * by the synchronous `pay()` flow, which already calls
 * `finalizeSuccessfulPayment` itself, directly, in the same request. If this
 * listener also reacted to the synchronous path's event, it would race the
 * request handler's own call to the same (transactional, but not
 * cross-call-serialized) method — two concurrent finalize attempts for the
 * same checkout, both reading "not yet CONFIRMED" before either commits.
 * The `viaWebhook` flag on the event payload is what keeps these two paths
 * from ever overlapping — this holds regardless of whether
 * DomainEventsService awaits its listeners (it does, via `emitAsync` —
 * Handoff 20), since the guard is about which code path calls
 * `finalizeSuccessfulPayment` at all, not about dispatch timing.
 */
@Injectable()
export class PaymentEventsListener {
  private readonly logger = new Logger(PaymentEventsListener.name);

  constructor(private readonly checkout: CheckoutService) {}

  @OnEvent("PaymentSucceeded")
  async onPaymentSucceeded(payload: { checkoutId: string; viaWebhook?: boolean }): Promise<void> {
    if (!payload.viaWebhook) return;
    try {
      await this.checkout.finalizeSuccessfulPayment(payload.checkoutId);
    } catch (error) {
      this.logger.error(`Failed to finalize checkout ${payload.checkoutId} after PaymentSucceeded`, error instanceof Error ? error.stack : undefined);
    }
  }
}
