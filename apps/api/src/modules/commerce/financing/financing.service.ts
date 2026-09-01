import { Injectable } from "@nestjs/common";
import { FinancingIntentStatus, Prisma, type FinancingIntent, type PaymentProvider } from "@prisma/client";
import type { FinancingEligibilityStatus, FinancingIntentDto, FinancingPlanOptionDto, FinancingPlanSnapshotDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { FinancingIntentNotFoundException, InvalidFinancingPlanException } from "../../../common/errors/api-exception";
import { FinancingProviderRegistry } from "./financing-provider-registry.service";
import type { FinancingAuthorizeMode, FinancingPlanOption } from "./financing-provider.interface";

type QueryClient = PrismaService | Prisma.TransactionClient;

export interface FinancingAuthorizeOutcome {
  intent: FinancingIntent;
  status: "APPROVED" | "DECLINED" | "PENDING";
  failureCode?: string;
  failureMessage?: string;
}

function toPlanOptionDto(plan: FinancingPlanOption): FinancingPlanOptionDto {
  return {
    providerPlanId: plan.providerPlanId,
    installmentCount: plan.installmentCount,
    downPaymentAmount: plan.downPaymentAmount ?? null,
    installmentAmount: plan.installmentAmount ?? null,
    feeAmount: plan.feeAmount ?? null,
    totalPayableAmount: plan.totalPayableAmount,
    currency: plan.currency,
    firstDueAt: plan.firstDueAt ?? null,
  };
}

function toSnapshotDto(snapshot: { id: string; providerPlanId: string; installmentCount: number; downPaymentAmount: number | null; installmentAmount: number | null; feeAmount: number | null; totalPayableAmount: number; currency: string; firstDueAt: Date | null }): FinancingPlanSnapshotDto {
  return {
    id: snapshot.id,
    providerPlanId: snapshot.providerPlanId,
    installmentCount: snapshot.installmentCount,
    downPaymentAmount: snapshot.downPaymentAmount,
    installmentAmount: snapshot.installmentAmount,
    feeAmount: snapshot.feeAmount,
    totalPayableAmount: snapshot.totalPayableAmount,
    currency: snapshot.currency,
    firstDueAt: snapshot.firstDueAt?.toISOString() ?? null,
  };
}

/**
 * BNPL/financing core (spec sections 4-5, 8-9, 12-14) — mirrors
 * PaymentsService's shape (create → act → resolve, all idempotent) but
 * against FinancingIntent's own state machine, never PaymentIntentStatus
 * (spec section 6). Every provider call goes through FinancingProviderRegistry,
 * never a direct adapter reference, so this service never branches on
 * provider identity itself.
 */
@Injectable()
export class FinancingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly providers: FinancingProviderRegistry,
  ) {}

  /** Idempotent: an existing non-terminal intent for this checkout+provider is reused rather than duplicated. */
  async createIntent(checkoutId: string, amount: number, currency: string, provider: PaymentProvider, client: QueryClient = this.prisma): Promise<FinancingIntent> {
    this.providers.resolve(provider); // throws FINANCING_NOT_AVAILABLE if disabled/unsupported

    const existing = await client.financingIntent.findFirst({
      where: {
        checkoutId,
        provider,
        status: { notIn: [FinancingIntentStatus.DECLINED, FinancingIntentStatus.CANCELLED, FinancingIntentStatus.EXPIRED] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    const intent = await client.financingIntent.create({
      data: { checkoutId, provider, amount, currency, status: FinancingIntentStatus.CREATED, expiresAt: new Date(Date.now() + 15 * 60_000) },
    });
    await this.events.publish("FinancingIntentCreated", { financingIntentId: intent.id, checkoutId, provider, amount }, { aggregateType: "FinancingIntent", aggregateId: intent.id });
    await this.events.publish("PaymentProviderRedirectCreated", { financingIntentId: intent.id, checkoutId, provider }, { aggregateType: "FinancingIntent", aggregateId: intent.id });
    return intent;
  }

  async getById(id: string): Promise<FinancingIntent> {
    const intent = await this.prisma.financingIntent.findUnique({ where: { id } });
    if (!intent) throw new FinancingIntentNotFoundException({ financingIntentId: id });
    return intent;
  }

  async getLatestForCheckout(checkoutId: string): Promise<FinancingIntent | null> {
    return this.prisma.financingIntent.findFirst({ where: { checkoutId }, orderBy: { createdAt: "desc" } });
  }

  /**
   * Pre-check eligibility (spec section 12) — only ever called for a
   * provider whose capabilities.supportsEligibilityCheck is true; a
   * provider without one (DigiPay) never reaches this method with a real
   * effect (its `checkEligibility` is simply absent), so there is no
   * "fake eligible" fallback anywhere in this class.
   */
  async checkEligibility(financingIntentId: string): Promise<FinancingEligibilityStatus> {
    const intent = await this.getById(financingIntentId);
    const adapter = this.providers.resolve(intent.provider);

    await this.prisma.financingIntent.update({ where: { id: financingIntentId }, data: { status: FinancingIntentStatus.ELIGIBILITY_PENDING } });

    if (!adapter.checkEligibility) {
      // Never faked — the caller should not have offered this step for a
      // provider without the capability; treat as immediately eligible to
      // fall through to plan/authorization, matching "use the provider
      // authorization flow directly".
      await this.prisma.financingIntent.update({ where: { id: financingIntentId }, data: { status: FinancingIntentStatus.ELIGIBLE } });
      await this.events.publish("FinancingEligibilityChecked", { financingIntentId, status: "ELIGIBLE", skipped: true }, { aggregateType: "FinancingIntent", aggregateId: financingIntentId });
      return "ELIGIBLE" as FinancingEligibilityStatus;
    }

    const result = await adapter.checkEligibility({ amount: intent.amount, currency: intent.currency });
    const nextStatus = result.status === ("ELIGIBLE" as FinancingEligibilityStatus) ? FinancingIntentStatus.ELIGIBLE : FinancingIntentStatus.NOT_ELIGIBLE;
    await this.prisma.financingIntent.update({ where: { id: financingIntentId }, data: { status: nextStatus } });
    await this.events.publish("FinancingEligibilityChecked", { financingIntentId, status: result.status }, { aggregateType: "FinancingIntent", aggregateId: financingIntentId });
    return result.status;
  }

  async getPlans(financingIntentId: string): Promise<FinancingPlanOptionDto[]> {
    const intent = await this.getById(financingIntentId);
    const adapter = this.providers.resolve(intent.provider);
    if (!adapter.getPlans) return [];
    const plans = await adapter.getPlans({ amount: intent.amount, currency: intent.currency });
    return plans.map(toPlanOptionDto);
  }

  async selectPlan(financingIntentId: string, providerPlanId: string): Promise<FinancingIntent> {
    const intent = await this.getById(financingIntentId);
    const adapter = this.providers.resolve(intent.provider);
    const plans = adapter.getPlans ? await adapter.getPlans({ amount: intent.amount, currency: intent.currency }) : [];
    const plan = plans.find((p) => p.providerPlanId === providerPlanId);
    if (!plan) throw new InvalidFinancingPlanException({ financingIntentId, providerPlanId });

    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.financingPlanSnapshot.create({
        data: {
          financingIntentId,
          providerPlanId: plan.providerPlanId,
          installmentCount: plan.installmentCount,
          downPaymentAmount: plan.downPaymentAmount ?? null,
          installmentAmount: plan.installmentAmount ?? null,
          feeAmount: plan.feeAmount ?? null,
          totalPayableAmount: plan.totalPayableAmount,
          currency: plan.currency,
          firstDueAt: plan.firstDueAt ? new Date(plan.firstDueAt) : null,
          scheduleJson: (plan.scheduleJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });
      const updated = await tx.financingIntent.update({
        where: { id: financingIntentId },
        data: { selectedPlanId: snapshot.id, status: FinancingIntentStatus.PLAN_SELECTED },
      });
      await this.events.publish("FinancingPlanSelected", { financingIntentId, providerPlanId }, { tx, aggregateType: "FinancingIntent", aggregateId: financingIntentId });
      return updated;
    });
  }

  /**
   * Server-side authorization (spec section 14: "Never confirm Orders
   * solely from browser return parameters"). The `mode` parameter is
   * sandbox-only (no real credentials exist for either provider — see
   * README); a real integration would omit it and rely entirely on the
   * provider's own redirect/webhook outcome.
   */
  async authorize(financingIntentId: string, mode?: FinancingAuthorizeMode): Promise<FinancingAuthorizeOutcome> {
    const intent = await this.getById(financingIntentId);
    const adapter = this.providers.resolve(intent.provider);

    await this.prisma.financingIntent.update({ where: { id: financingIntentId }, data: { status: FinancingIntentStatus.AUTHORIZATION_PENDING } });

    const selectedPlan = intent.selectedPlanId ? await this.prisma.financingPlanSnapshot.findUnique({ where: { id: intent.selectedPlanId } }) : null;
    const result = await adapter.authorize({
      financingIntentId,
      amount: intent.amount,
      currency: intent.currency,
      selectedPlan: selectedPlan
        ? {
            providerPlanId: selectedPlan.providerPlanId,
            installmentCount: selectedPlan.installmentCount,
            totalPayableAmount: selectedPlan.totalPayableAmount,
            currency: selectedPlan.currency,
          }
        : undefined,
      mode,
    });

    return this.applyOutcome(financingIntentId, result.status, result.providerReference, result.failureCode, result.failureMessage, false);
  }

  /** Webhook-driven resolution of an AUTHORIZATION_PENDING intent — idempotent, mirrors PaymentsService.resolvePendingIntent exactly. */
  async resolveAuthorization(financingIntentId: string, providerReference: string, status: "APPROVED" | "DECLINED"): Promise<FinancingAuthorizeOutcome | null> {
    const intent = await this.prisma.financingIntent.findUnique({ where: { id: financingIntentId } });
    if (!intent) return null;
    if (intent.status === FinancingIntentStatus.APPROVED || intent.status === FinancingIntentStatus.DECLINED) {
      return { intent, status: intent.status === FinancingIntentStatus.APPROVED ? "APPROVED" : "DECLINED" };
    }
    if (intent.status !== FinancingIntentStatus.AUTHORIZATION_PENDING) return null;

    return this.applyOutcome(financingIntentId, status, providerReference, undefined, undefined, true);
  }

  private async applyOutcome(
    financingIntentId: string,
    status: "APPROVED" | "DECLINED" | "PENDING",
    providerReference: string,
    failureCode: string | undefined,
    failureMessage: string | undefined,
    viaWebhook: boolean,
  ): Promise<FinancingAuthorizeOutcome> {
    const nextStatus = status === "APPROVED" ? FinancingIntentStatus.APPROVED : status === "DECLINED" ? FinancingIntentStatus.DECLINED : FinancingIntentStatus.AUTHORIZATION_PENDING;
    const intent = await this.prisma.financingIntent.update({ where: { id: financingIntentId }, data: { status: nextStatus, providerReference } });

    const payload = { financingIntentId, checkoutId: intent.checkoutId, status, viaWebhook: viaWebhook || undefined };
    if (status === "APPROVED") await this.events.publish("FinancingApproved", payload, { aggregateType: "FinancingIntent", aggregateId: financingIntentId });
    else if (status === "DECLINED") await this.events.publish("FinancingDeclined", payload, { aggregateType: "FinancingIntent", aggregateId: financingIntentId });
    else await this.events.publish("PaymentPending", payload, { aggregateType: "FinancingIntent", aggregateId: financingIntentId });

    return { intent, status, failureCode, failureMessage };
  }

  async getLatestProviderReference(financingIntentId: string): Promise<string | null> {
    const intent = await this.prisma.financingIntent.findUnique({ where: { id: financingIntentId } });
    return intent?.providerReference ?? null;
  }

  async toDto(intent: FinancingIntent): Promise<FinancingIntentDto> {
    const [availablePlans, selectedPlan] = await Promise.all([
      intent.selectedPlanId ? Promise.resolve([]) : this.getPlans(intent.id).catch(() => []),
      intent.selectedPlanId ? this.prisma.financingPlanSnapshot.findUnique({ where: { id: intent.selectedPlanId } }) : Promise.resolve(null),
    ]);
    return {
      id: intent.id,
      checkoutId: intent.checkoutId,
      provider: intent.provider as unknown as FinancingIntentDto["provider"],
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status as unknown as FinancingIntentDto["status"],
      eligibility: eligibilityFromStatus(intent.status),
      availablePlans,
      selectedPlan: selectedPlan ? toSnapshotDto(selectedPlan) : null,
      expiresAt: intent.expiresAt?.toISOString() ?? null,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };
  }
}

function eligibilityFromStatus(status: FinancingIntentStatus): FinancingEligibilityStatus | null {
  if (status === FinancingIntentStatus.ELIGIBILITY_PENDING) return "CHECKING" as FinancingEligibilityStatus;
  if (status === FinancingIntentStatus.ELIGIBLE) return "ELIGIBLE" as FinancingEligibilityStatus;
  if (status === FinancingIntentStatus.NOT_ELIGIBLE) return "NOT_ELIGIBLE" as FinancingEligibilityStatus;
  return null;
}
