import { Injectable } from "@nestjs/common";
import { PaymentAttemptStatus, PaymentIntentStatus, PaymentProvider, Prisma, TransactionStatus, TransactionType, type PaymentIntent } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { PaymentAlreadyCompletedException } from "../../../common/errors/api-exception";
import { PaymentGatewayRegistry } from "./payment-gateway-registry.service";
import type { PaymentChargeMode } from "./payment-gateway.interface";

type QueryClient = PrismaService | Prisma.TransactionClient;

function toAttemptStatus(status: "SUCCEEDED" | "FAILED" | "PENDING"): PaymentAttemptStatus {
  if (status === "SUCCEEDED") return PaymentAttemptStatus.SUCCEEDED;
  if (status === "FAILED") return PaymentAttemptStatus.FAILED;
  return PaymentAttemptStatus.PENDING;
}

function toIntentStatus(status: "SUCCEEDED" | "FAILED" | "PENDING"): PaymentIntentStatus {
  if (status === "SUCCEEDED") return PaymentIntentStatus.CAPTURED;
  if (status === "FAILED") return PaymentIntentStatus.FAILED;
  return PaymentIntentStatus.PENDING;
}

function toTransactionStatus(status: "SUCCEEDED" | "FAILED" | "PENDING"): TransactionStatus {
  if (status === "SUCCEEDED") return TransactionStatus.SUCCEEDED;
  if (status === "FAILED") return TransactionStatus.FAILED;
  return TransactionStatus.PENDING;
}

export interface ChargeOutcome {
  intent: PaymentIntent;
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  failureCode?: string;
  failureMessage?: string;
}

/**
 * Payment core (spec sections 33-36, and Handoff 07 sections 3, 47) — every
 * method here only ever talks to PaymentIntent/PaymentAttempt/Transaction
 * and the PaymentGateway interface (resolved per-intent via
 * PaymentGatewayRegistry, never a single injected gateway), never to
 * Checkout/Order/Inventory directly. CheckoutService is the orchestrator
 * that decides what a charge outcome *means* for the checkout; this service
 * only decides what it means for the payment records themselves.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  /** Idempotent: an existing non-terminal intent for this checkout is reused rather than duplicated. Defaults to DEV_SIMULATED — the only provider Handoff 06's ONLINE_PAYMENT flow ever used before this handoff added others. */
  async createIntent(
    checkoutId: string,
    amount: number,
    currency: string,
    provider: PaymentProvider = PaymentProvider.DEV_SIMULATED,
    idempotencyKey?: string,
    client: QueryClient = this.prisma,
  ): Promise<PaymentIntent> {
    const existing = await client.paymentIntent.findFirst({
      where: { checkoutId, status: { in: [PaymentIntentStatus.REQUIRES_PAYMENT_METHOD, PaymentIntentStatus.PENDING] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    // Confirms the provider is actually enabled/known before creating a
    // durable record for it — never persist an intent for a provider that
    // can't ever be charged.
    this.gateways.resolve(provider);

    const intent = await client.paymentIntent.create({
      data: { checkoutId, amount, currency, provider, idempotencyKey: idempotencyKey ?? null },
    });
    await this.events.publish("PaymentIntentCreated", { paymentIntentId: intent.id, checkoutId, amount, provider }, { aggregateType: "PaymentIntent", aggregateId: intent.id });
    if (provider !== PaymentProvider.DEV_SIMULATED) {
      await this.events.publish("PaymentProviderRedirectCreated", { paymentIntentId: intent.id, checkoutId, provider }, { aggregateType: "PaymentIntent", aggregateId: intent.id });
    }
    return intent;
  }

  /**
   * Runs one gateway charge attempt against an existing PaymentIntent and
   * records the result (a new PaymentAttempt + Transaction row, and the
   * intent's own status). Never called on an already-CAPTURED intent —
   * callers must check `PAYMENT_ALREADY_COMPLETED` first (CheckoutService
   * does, before ever reaching this method).
   */
  async charge(intentId: string, mode: PaymentChargeMode | undefined, client: QueryClient = this.prisma): Promise<ChargeOutcome> {
    const intent = await client.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    if (intent.status === PaymentIntentStatus.CAPTURED) throw new PaymentAlreadyCompletedException({ paymentIntentId: intentId });

    const attempt = await client.paymentAttempt.create({
      data: { paymentIntentId: intentId, provider: intent.provider, status: PaymentAttemptStatus.STARTED },
    });
    await this.events.publish("PaymentAttemptStarted", { paymentIntentId: intentId, paymentAttemptId: attempt.id }, { aggregateType: "PaymentIntent", aggregateId: intentId });

    const gateway = this.gateways.resolve(intent.provider);
    const result = await gateway.charge({ amount: intent.amount, currency: intent.currency, mode });

    await client.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: toAttemptStatus(result.status),
        providerReference: result.providerReference,
        failureCode: result.failureCode ?? null,
        failureMessage: result.failureMessage ?? null,
        completedAt: new Date(),
      },
    });
    await client.transaction.create({
      data: {
        paymentIntentId: intentId,
        paymentAttemptId: attempt.id,
        type: TransactionType.CHARGE,
        amount: intent.amount,
        currency: intent.currency,
        status: toTransactionStatus(result.status),
      },
    });

    const updatedIntent = await client.paymentIntent.update({ where: { id: intentId }, data: { status: toIntentStatus(result.status) } });

    await this.publishOutcomeEvents(intentId, intent.checkoutId, result.status, false);

    return { intent: updatedIntent, status: result.status, failureCode: result.failureCode, failureMessage: result.failureMessage };
  }

  async getIntent(checkoutId: string): Promise<PaymentIntent | null> {
    return this.prisma.paymentIntent.findFirst({ where: { checkoutId }, orderBy: { createdAt: "desc" } });
  }

  async getIntentById(intentId: string): Promise<PaymentIntent | null> {
    return this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
  }

  /** The latest gateway-reported reference for this intent — what a reconciliation/refund call queries the provider by. */
  async getLatestProviderReference(intentId: string): Promise<string | null> {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { paymentIntentId: intentId, providerReference: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    return attempt?.providerReference ?? null;
  }

  /**
   * The one path this phase actually needs the webhook slot for: a
   * PaymentIntent left PENDING by a synchronous `charge()` call (spec
   * section 40, "PAYMENT_PENDING... Design future-safe async confirmation")
   * is later resolved by an out-of-band notification, exactly like a real
   * gateway's webhook would report a delayed authorization result.
   * Idempotent by construction: an intent that has already reached a
   * terminal status (CAPTURED/FAILED) treats a repeat webhook call as a
   * safe no-op rather than reprocessing it — duplicate-delivery safety at
   * the transport level is PaymentProviderEvent's own unique constraint
   * (see ProviderEventsService), this is the second, intent-level layer.
   */
  async resolvePendingIntent(intentId: string, eventId: string, status: "SUCCEEDED" | "FAILED"): Promise<ChargeOutcome | null> {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) return null;
    if (intent.status === PaymentIntentStatus.CAPTURED || intent.status === PaymentIntentStatus.FAILED) {
      return { intent, status: intent.status === PaymentIntentStatus.CAPTURED ? "SUCCEEDED" : "FAILED" };
    }

    const pendingAttempt = await this.prisma.paymentAttempt.findFirst({
      where: { paymentIntentId: intentId, status: PaymentAttemptStatus.PENDING },
      orderBy: { createdAt: "desc" },
    });
    if (!pendingAttempt) return null;

    await this.prisma.paymentAttempt.update({
      where: { id: pendingAttempt.id },
      data: { status: toAttemptStatus(status), providerReference: eventId, completedAt: new Date() },
    });
    await this.prisma.transaction.create({
      data: { paymentIntentId: intentId, paymentAttemptId: pendingAttempt.id, type: TransactionType.CHARGE, amount: intent.amount, currency: intent.currency, status: toTransactionStatus(status) },
    });
    const updatedIntent = await this.prisma.paymentIntent.update({ where: { id: intentId }, data: { status: toIntentStatus(status) } });

    await this.publishOutcomeEvents(intentId, intent.checkoutId, status, true);

    return { intent: updatedIntent, status };
  }

  private async publishOutcomeEvents(intentId: string, checkoutId: string, status: "SUCCEEDED" | "FAILED" | "PENDING", viaWebhook: boolean): Promise<void> {
    const base = { paymentIntentId: intentId, checkoutId, status, viaWebhook: viaWebhook || undefined };
    if (status === "SUCCEEDED") {
      await this.events.publish("PaymentAuthorized", base, { aggregateType: "PaymentIntent", aggregateId: intentId });
      await this.events.publish("PaymentCaptured", base, { aggregateType: "PaymentIntent", aggregateId: intentId });
      await this.events.publish("PaymentSucceeded", base, { aggregateType: "PaymentIntent", aggregateId: intentId });
    } else if (status === "FAILED") {
      await this.events.publish("PaymentDeclined", base, { aggregateType: "PaymentIntent", aggregateId: intentId });
      await this.events.publish("PaymentFailed", base, { aggregateType: "PaymentIntent", aggregateId: intentId });
    } else {
      await this.events.publish("PaymentPending", base, { aggregateType: "PaymentIntent", aggregateId: intentId });
    }
  }
}
