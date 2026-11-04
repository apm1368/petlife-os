import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PaymentIntentStatus, PaymentProvider } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CheckoutService } from "../checkout/checkout.service";
import { WalletService } from "./wallet.service";

/** Wallet checkout contract. The generic PaymentIntent is retained solely as
 * an immutable checkout attempt; value movement is exclusively WalletEntry +
 * LedgerTransaction, never a simulated gateway charge. */
@Injectable()
export class WalletPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private get checkout(): CheckoutService {
    return this.moduleRef.get(CheckoutService, { strict: false });
  }

  async payCheckout(userId: string, checkoutId: string, idempotencyKey?: string) {
    const intent = await this.checkout.createPaymentIntent(userId, checkoutId, PaymentProvider.DEV_SIMULATED, idempotencyKey);
    if (intent.status === PaymentIntentStatus.CAPTURED) return { checkoutId, orderIds: await this.checkout.finalizeSuccessfulPayment(checkoutId, false) };
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
      if (current.status === PaymentIntentStatus.CAPTURED) return;
      await this.wallet.debitForPurchase({ userId, amount: current.amount, referenceType: "PAYMENT_INTENT", referenceId: current.id }, tx);
      await tx.paymentIntent.update({ where: { id: current.id }, data: { status: PaymentIntentStatus.CAPTURED, rail: "WALLET" } });
    });
    return { checkoutId, orderIds: await this.checkout.finalizeSuccessfulPayment(checkoutId, false) };
  }
}
