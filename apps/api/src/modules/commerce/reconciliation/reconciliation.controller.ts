import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { ReconciliationService } from "./reconciliation.service";

/**
 * Manual/on-demand reconciliation trigger (spec section 27: "no full
 * scheduler required yet"). A customer may refresh only their own payment:
 * the intent's checkout must belong to the caller, otherwise 404 — the same
 * answer as a missing id, so other people's payments are neither triggered
 * nor revealed.
 */
@Controller()
@UseGuards(SessionAuthGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post("payments/reconcile/:paymentIntentId")
  async reconcilePayment(@CurrentUser() user: SessionUser, @Param("paymentIntentId") paymentIntentId: string) {
    await this.reconciliation.assertOwnsPaymentIntent(paymentIntentId, user.id);
    return this.reconciliation.reconcilePaymentIntent(paymentIntentId);
  }

  @Post("financing/reconcile/:financingIntentId")
  async reconcileFinancing(@CurrentUser() user: SessionUser, @Param("financingIntentId") financingIntentId: string) {
    await this.reconciliation.assertOwnsFinancingIntent(financingIntentId, user.id);
    return this.reconciliation.reconcileFinancingIntent(financingIntentId);
  }
}
