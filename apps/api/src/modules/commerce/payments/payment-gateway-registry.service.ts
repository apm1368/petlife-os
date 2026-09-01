import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { PaymentProviderUnavailableException } from "../../../common/errors/api-exception";
import { DevPaymentGateway } from "./dev-payment-gateway.service";
import { StandardGatewayAdapter } from "./standard-gateway.adapter";
import type { PaymentGateway } from "./payment-gateway.interface";

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
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    this.gateways = new Map<PaymentProvider, PaymentGateway>([
      [PaymentProvider.DEV_SIMULATED, dev],
      [PaymentProvider.STANDARD_GATEWAY, standard],
    ]);
  }

  private isEnabled(provider: PaymentProvider): boolean {
    if (provider === PaymentProvider.DEV_SIMULATED) return true;
    if (provider === PaymentProvider.STANDARD_GATEWAY) return this.config.get("STANDARD_GATEWAY_ENABLED", { infer: true });
    return false;
  }

  resolve(provider: PaymentProvider): PaymentGateway {
    if (!this.isEnabled(provider)) throw new PaymentProviderUnavailableException({ provider });
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new PaymentProviderUnavailableException({ provider });
    return gateway;
  }

  listEnabled(): PaymentGateway[] {
    return [...this.gateways.values()].filter((gateway) => this.isEnabled(gateway.provider));
  }
}
