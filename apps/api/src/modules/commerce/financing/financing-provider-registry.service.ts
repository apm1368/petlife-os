import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { FinancingNotAvailableException } from "../../../common/errors/api-exception";
import { SnappPayAdapter } from "./snapp-pay.adapter";
import { DigiPayAdapter } from "./digi-pay.adapter";
import type { FinancingProvider } from "./financing-provider.interface";

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

  listEnabled(): FinancingProvider[] {
    return [...this.providers.values()].filter((provider) => this.isEnabled(provider.provider));
  }
}
