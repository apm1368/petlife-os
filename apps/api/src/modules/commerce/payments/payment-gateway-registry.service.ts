import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { PaymentProviderUnavailableException } from "../../../common/errors/api-exception";
import { DevPaymentGateway } from "./dev-payment-gateway.service";
import { StandardGatewayAdapter } from "./standard-gateway.adapter";
import { ZibalGateway } from "./zibal.gateway";
import type { PaymentGateway } from "./payment-gateway.interface";
import { devSimulationAllowed } from "../../../common/dev/dev-simulation";

/**
 * Resolves a `PaymentProvider` enum value to its adapter instance (spec
 * section 3) — every caller (PaymentsService, ReconciliationService) goes
 * through this registry rather than injecting a concrete adapter class, so
 * a checkout's chosen provider decides which adapter runs without any
 * `if (provider === ...)` branch outside this one file.
 */
@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways: Map<PaymentProvider, PaymentGateway>;

  constructor(
    dev: DevPaymentGateway,
    standard: StandardGatewayAdapter,
    zibal: ZibalGateway,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    this.gateways = new Map<PaymentProvider, PaymentGateway>([
      [PaymentProvider.DEV_SIMULATED, dev],
      [PaymentProvider.STANDARD_GATEWAY, standard],
      [PaymentProvider.ZIBAL, zibal],
    ]);
  }

  private isEnabled(provider: PaymentProvider): boolean {
    // DEV_SIMULATED has no real merchant integration behind it at all — it
    // must never be reachable once real traffic is expected, regardless of
    // which provider a caller requests (it is also the DTO's own default).
    const isProduction = this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) === "production";
    if (provider === PaymentProvider.DEV_SIMULATED) return !isProduction;
    if (provider === PaymentProvider.STANDARD_GATEWAY) return this.config.get("STANDARD_GATEWAY_ENABLED", { infer: true });
    if (provider === PaymentProvider.ZIBAL) return this.config.get("ZIBAL_ENABLED", { infer: true });
    return false;
  }

  /**
   * Whether a charge through this provider would move real money. In sandbox mode every gateway here is a stub
   * that reports whatever outcome the caller asks for (DEV_SIMULATED, the standard-gateway stub, Zibal's sandbox),
   * so on a server people use — dev simulation off — nothing in sandbox mode may take a payment: a member could
   * otherwise mark an order, booking, subscription, donation or trip as paid without paying.
   */
  isChargeable(provider: PaymentProvider): boolean {
    if (!this.isEnabled(provider)) return false;
    const sandbox = this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) !== "production";
    return !sandbox || devSimulationAllowed(this.config);
  }

  assertChargeable(provider: PaymentProvider): void {
    if (!this.isChargeable(provider)) throw new PaymentProviderUnavailableException({ provider, reason: "SIMULATED_PAYMENTS_DISABLED" });
  }

  /** The provider's adapter — for records, reconciliation and webhook verification; charging also needs assertChargeable. */
  resolve(provider: PaymentProvider): PaymentGateway {
    if (!this.isEnabled(provider)) throw new PaymentProviderUnavailableException({ provider });
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new PaymentProviderUnavailableException({ provider });
    return gateway;
  }

  /** Gateways that can take a payment right now — what payment options, donations and the payment environment offer. */
  listEnabled(): PaymentGateway[] {
    return [...this.gateways.values()].filter((gateway) => this.isChargeable(gateway.provider));
  }
}
