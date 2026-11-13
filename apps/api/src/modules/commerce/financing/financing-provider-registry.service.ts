import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { FinancingNotAvailableException } from "../../../common/errors/api-exception";
import { SnappPayAdapter } from "./snapp-pay.adapter";
import { DigiPayAdapter } from "./digi-pay.adapter";
import type { FinancingProvider } from "./financing-provider.interface";
import { devSimulationAllowed } from "../../../common/dev/dev-simulation";

/** Resolves a `PaymentProvider` enum value to its financing adapter — same pattern as PaymentGatewayRegistry, kept as a separate registry since the two adapter shapes are unrelated interfaces (spec section 6). */
@Injectable()
export class FinancingProviderRegistry {
  private readonly providers: Map<PaymentProvider, FinancingProvider>;

  constructor(
    snappPay: SnappPayAdapter,
    digiPay: DigiPayAdapter,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    this.providers = new Map<PaymentProvider, FinancingProvider>([
      [PaymentProvider.SNAPP_PAY, snappPay],
      [PaymentProvider.DIGI_PAY, digiPay],
    ]);
  }

  private isEnabled(provider: PaymentProvider): boolean {
    if (provider === PaymentProvider.SNAPP_PAY) return this.config.get("SNAPPAY_ENABLED", { infer: true });
    if (provider === PaymentProvider.DIGI_PAY) return this.config.get("DIGIPAY_ENABLED", { infer: true });
    return false;
  }

  resolve(provider: PaymentProvider): FinancingProvider {
    if (!this.isEnabled(provider)) throw new FinancingNotAvailableException({ provider });
    const adapter = this.providers.get(provider);
    if (!adapter) throw new FinancingNotAvailableException({ provider });
    return adapter;
  }

  /** In sandbox mode the installment adapters approve whatever is asked, so they authorize only where dev simulation is on. */
  isAuthorizable(provider: PaymentProvider): boolean {
    if (!this.isEnabled(provider)) return false;
    return this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) === "production" || devSimulationAllowed(this.config);
  }

  assertAuthorizable(provider: PaymentProvider): void {
    if (!this.isAuthorizable(provider)) throw new FinancingNotAvailableException({ provider, reason: "SIMULATED_PAYMENTS_DISABLED" });
  }

  /** Installment providers that can authorize right now — what payment options offer. */
  listEnabled(): FinancingProvider[] {
    return [...this.providers.values()].filter((provider) => this.isAuthorizable(provider.provider));
  }
}
