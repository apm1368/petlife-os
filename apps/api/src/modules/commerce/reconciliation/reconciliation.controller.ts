import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { ReconciliationService } from "./reconciliation.service";

/**
 * Manual/on-demand reconciliation trigger (spec section 27: "no full
 * scheduler required yet"). Gated by session auth only — there is no
 * separate ops/admin role model in this project yet (see README Known
 * limitations); a real deployment would restrict this to an internal
 * operator role or a scheduled job, not any signed-in user.
 */
@Controller()
@UseGuards(SessionAuthGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post("payments/reconcile/:paymentIntentId")
  reconcilePayment(@Param("paymentIntentId") paymentIntentId: string) {
    return this.reconciliation.reconcilePaymentIntent(paymentIntentId);
  }

  @Post("financing/reconcile/:financingIntentId")
  reconcileFinancing(@Param("financingIntentId") financingIntentId: string) {
    return this.reconciliation.reconcileFinancingIntent(financingIntentId);
  }
}
