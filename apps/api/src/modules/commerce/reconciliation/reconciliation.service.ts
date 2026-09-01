import { Injectable } from "@nestjs/common";
import { FinancingIntentStatus, PaymentIntentStatus, type PaymentProvider, type ReconciliationLog } from "@prisma/client";
import type { ReconciliationLogDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { PaymentGatewayRegistry } from "../payments/payment-gateway-registry.service";
import { PaymentsService } from "../payments/payments.service";
import { FinancingProviderRegistry } from "../financing/financing-provider-registry.service";
import { FinancingService } from "../financing/financing.service";

function toDto(log: ReconciliationLog): ReconciliationLogDto {
  return {
    id: log.id,
    provider: log.provider as unknown as ReconciliationLogDto["provider"],
    referenceType: log.referenceType as ReconciliationLogDto["referenceType"],
    referenceId: log.referenceId,
    localStatus: log.localStatus,
    remoteStatus: log.remoteStatus,
    action: log.action as ReconciliationLogDto["action"],
    createdAt: log.createdAt.toISOString(),
  };
}

/**
 * Reconciliation (spec sections 27-29) — resolves a disagreement between
 * local and provider state by driving the exact same idempotent
 * resolve-path a real webhook would (`PaymentsService.resolvePendingIntent`
 * / `FinancingService.resolveAuthorization`), never by writing a status
 * directly. Every check appends one ReconciliationLog row regardless of
 * outcome (spec: audit-friendly, not just a log line) — including a plain
 * "already agreed" NONE action, so "was this ever checked?" is always
 * answerable from data. No scheduler exists yet (spec section 27: "no full
 * scheduler required yet") — this is triggered manually/on demand.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly gateways: PaymentGatewayRegistry,
    private readonly payments: PaymentsService,
    private readonly financingProviders: FinancingProviderRegistry,
    private readonly financing: FinancingService,
  ) {}

  async reconcilePaymentIntent(intentId: string): Promise<ReconciliationLogDto> {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    const providerReference = await this.payments.getLatestProviderReference(intentId);

    if (!providerReference) {
      return this.appendLog(intent.provider, "PAYMENT_INTENT", intentId, intent.status, "UNKNOWN", "UNKNOWN_REMOTE_STATE");
    }

    const gateway = this.gateways.resolve(intent.provider);
    const remote = await gateway.getStatus(providerReference);

    let action: ReconciliationLogDto["action"] = "NONE";
    if (intent.status === PaymentIntentStatus.PENDING) {
      if (remote.status === "CAPTURED") {
        await this.payments.resolvePendingIntent(intentId, `reconcile_${Date.now()}`, "SUCCEEDED");
        action = "RESOLVED_SUCCEEDED";
      } else if (remote.status === "FAILED" || remote.status === "CANCELLED") {
        await this.payments.resolvePendingIntent(intentId, `reconcile_${Date.now()}`, "FAILED");
        action = "RESOLVED_FAILED";
      } else if (remote.status === "UNKNOWN") {
        action = "UNKNOWN_REMOTE_STATE";
      }
    }

    const log = await this.appendLog(intent.provider, "PAYMENT_INTENT", intentId, intent.status, remote.status, action);
    await this.events.publish("PaymentReconciled", { paymentIntentId: intentId, localStatus: intent.status, remoteStatus: remote.status, action }, { aggregateType: "PaymentIntent", aggregateId: intentId });
    return log;
  }

  async reconcileFinancingIntent(intentId: string): Promise<ReconciliationLogDto> {
    const intent = await this.prisma.financingIntent.findUniqueOrThrow({ where: { id: intentId } });

    if (!intent.providerReference) {
      return this.appendLog(intent.provider, "FINANCING_INTENT", intentId, intent.status, "UNKNOWN", "UNKNOWN_REMOTE_STATE");
    }

    const provider = this.financingProviders.resolve(intent.provider);
    const remote = await provider.getStatus(intent.providerReference);

    let action: ReconciliationLogDto["action"] = "NONE";
    if (intent.status === FinancingIntentStatus.AUTHORIZATION_PENDING) {
      if (remote.status === "APPROVED") {
        await this.financing.resolveAuthorization(intentId, intent.providerReference, "APPROVED");
        action = "RESOLVED_SUCCEEDED";
      } else if (remote.status === "DECLINED" || remote.status === "CANCELLED") {
        await this.financing.resolveAuthorization(intentId, intent.providerReference, "DECLINED");
        action = "RESOLVED_FAILED";
      } else if (remote.status === "UNKNOWN") {
        action = "UNKNOWN_REMOTE_STATE";
      }
    }

    const log = await this.appendLog(intent.provider, "FINANCING_INTENT", intentId, intent.status, remote.status, action);
    await this.events.publish("PaymentReconciled", { financingIntentId: intentId, localStatus: intent.status, remoteStatus: remote.status, action }, { aggregateType: "FinancingIntent", aggregateId: intentId });
    return log;
  }

  private async appendLog(
    provider: PaymentProvider,
    referenceType: "PAYMENT_INTENT" | "FINANCING_INTENT",
    referenceId: string,
    localStatus: string,
    remoteStatus: string,
    action: ReconciliationLogDto["action"],
  ): Promise<ReconciliationLogDto> {
    const log = await this.prisma.reconciliationLog.create({
      data: { provider, referenceType, referenceId, localStatus, remoteStatus, action },
    });
    return toDto(log);
  }
}
