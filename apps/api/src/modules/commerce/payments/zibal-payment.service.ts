import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { PaymentAttemptStatus, PaymentIntentStatus, PaymentProvider, TransactionStatus, TransactionType, ZibalPaymentStatus } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import { CheckoutService } from "../checkout/checkout.service";
import { ZibalGateway } from "./zibal.gateway";

/** Mandatory two-step Zibal orchestration. Initiating a redirect is never a payment. */
@Injectable()
export class ZibalPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly gateway: ZibalGateway,
    @Inject(forwardRef(() => CheckoutService)) private readonly checkout: CheckoutService,
  ) {}

  async initiate(userId: string, checkoutId: string, idempotencyKey?: string) {
    const intent = await this.checkout.createPaymentIntent(userId, checkoutId, PaymentProvider.ZIBAL, idempotencyKey);
    const existing = await this.prisma.zibalPayment.findUnique({ where: { paymentIntentId: intent.id } });
    if (existing?.trackId) return { ...existing, redirectUrl: `https://gateway.zibal.ir/start/${existing.trackId}` };
    const callbackUrl = this.config.get("ZIBAL_CALLBACK_URL", { infer: true });
    if (!callbackUrl) throw new ValidationApiException({ field: "zibal", reason: "ZIBAL_CALLBACK_URL_NOT_CONFIGURED" });
    try {
      const remote = await this.gateway.request(intent.amount, callbackUrl, intent.id);
      const payment = await this.prisma.zibalPayment.upsert({
        where: { paymentIntentId: intent.id },
        update: { status: ZibalPaymentStatus.REDIRECTED, trackId: remote.trackId, callbackUrl },
        create: { paymentIntentId: intent.id, status: ZibalPaymentStatus.REDIRECTED, trackId: remote.trackId, callbackUrl },
      });
      await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { rail: "ZIBAL", status: PaymentIntentStatus.PENDING } });
      return { ...payment, redirectUrl: remote.redirectUrl };
    } catch (error) {
      await this.prisma.zibalPayment.upsert({ where: { paymentIntentId: intent.id }, update: { status: ZibalPaymentStatus.UNKNOWN, failureCode: "REQUEST_UNAVAILABLE", failureMessage: error instanceof Error ? error.message : "Unknown request failure" }, create: { paymentIntentId: intent.id, callbackUrl, status: ZibalPaymentStatus.UNKNOWN, failureCode: "REQUEST_UNAVAILABLE", failureMessage: error instanceof Error ? error.message : "Unknown request failure" } });
      // No money is assumed to have moved. The payment remains reconcilable;
      // support may direct the customer to the card-transfer fallback.
      throw new ValidationApiException({ field: "zibal", reason: "ZIBAL_REQUEST_UNAVAILABLE_USE_CARD_TRANSFER" });
    }
  }

  async verify(trackId: string) {
    const payment = await this.prisma.zibalPayment.findUnique({ where: { trackId }, include: { paymentIntent: true } });
    if (!payment) throw new ValidationApiException({ field: "trackId", reason: "ZIBAL_PAYMENT_NOT_FOUND" });
    if (payment.status === ZibalPaymentStatus.VERIFIED) return { verified: true, checkoutId: payment.paymentIntent.checkoutId, orderIds: await this.checkout.finalizeSuccessfulPayment(payment.paymentIntent.checkoutId) };
    try {
      const remote = await this.gateway.verify(trackId);
      if (!remote.verified) {
        await this.prisma.$transaction(async (tx) => {
          await tx.zibalPayment.update({ where: { id: payment.id }, data: { status: ZibalPaymentStatus.FAILED, failedAt: new Date(), failureCode: remote.failureCode, failureMessage: remote.failureMessage } });
          await tx.paymentIntent.update({ where: { id: payment.paymentIntentId }, data: { status: PaymentIntentStatus.FAILED } });
        });
        return { verified: false, checkoutId: payment.paymentIntent.checkoutId, orderIds: [] as string[] };
      }
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.paymentIntent.findUniqueOrThrow({ where: { id: payment.paymentIntentId } });
        if (current.status === PaymentIntentStatus.CAPTURED) return;
        await tx.zibalPayment.update({ where: { id: payment.id }, data: { status: ZibalPaymentStatus.VERIFIED, verifiedAt: new Date() } });
        await tx.paymentIntent.update({ where: { id: current.id }, data: { status: PaymentIntentStatus.CAPTURED, rail: "ZIBAL" } });
        const attempt = await tx.paymentAttempt.create({ data: { paymentIntentId: current.id, provider: PaymentProvider.ZIBAL, providerReference: trackId, status: PaymentAttemptStatus.SUCCEEDED, completedAt: new Date() } });
        await tx.transaction.create({ data: { paymentIntentId: current.id, paymentAttemptId: attempt.id, type: TransactionType.CHARGE, amount: current.amount, currency: current.currency, status: TransactionStatus.SUCCEEDED } });
      });
      return { verified: true, checkoutId: payment.paymentIntent.checkoutId, orderIds: await this.checkout.finalizeSuccessfulPayment(payment.paymentIntent.checkoutId) };
    } catch (error) {
      await this.prisma.zibalPayment.update({ where: { id: payment.id }, data: { status: ZibalPaymentStatus.UNKNOWN, failureCode: "VERIFY_UNAVAILABLE", failureMessage: error instanceof Error ? error.message : "Unknown verify failure" } });
      // Unknown is deliberately not FAILED: reconciliation/manual dashboard
      // verification is required before any order, refund or wallet credit.
      throw new ValidationApiException({ field: "zibal", reason: "ZIBAL_VERIFY_UNKNOWN_MANUAL_RECONCILIATION_REQUIRED" });
    }
  }
}
