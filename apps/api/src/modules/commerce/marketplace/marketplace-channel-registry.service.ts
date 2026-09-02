import { Injectable } from "@nestjs/common";
import { MarketplaceProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { MarketplaceProviderDisabledException, MarketplaceProviderUnavailableException, MarketplaceListingCapabilityUnsupportedException } from "../../../common/errors/api-exception";
import { DevMarketplaceAdapter } from "./dev-marketplace.adapter";
import { TorobAdapter } from "./torob.adapter";
import { DigikalaAdapter } from "./digikala.adapter";
import type { MarketplaceProviderCapabilities, SalesChannelAdapter } from "./marketplace-channel-adapter.interface";

/**
 * Resolves a `MarketplaceProvider` enum value to its adapter instance (spec
 * section 12) — mirrors ShippingProviderRegistry/PaymentGatewayRegistry
 * exactly. Every caller (MarketplaceSyncOrchestrator,
 * MarketplaceOrderIngestionService, controllers) goes through this
 * registry; no `if (provider === ...)` branch exists anywhere outside this
 * one file.
 */
@Injectable()
export class MarketplaceChannelRegistry {
  private readonly adapters: Map<MarketplaceProvider, SalesChannelAdapter>;

  constructor(
    dev: DevMarketplaceAdapter,
    torob: TorobAdapter,
    digikala: DigikalaAdapter,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    this.adapters = new Map<MarketplaceProvider, SalesChannelAdapter>([
      [MarketplaceProvider.DEV, dev],
      [MarketplaceProvider.TOROB, torob],
      [MarketplaceProvider.DIGIKALA, digikala],
    ]);
  }

  isEnabled(provider: MarketplaceProvider): boolean {
    if (provider === MarketplaceProvider.DEV) return this.config.get("DEV_MARKETPLACE_ENABLED", { infer: true });
    if (provider === MarketplaceProvider.TOROB) return this.config.get("TOROB_ENABLED", { infer: true });
    if (provider === MarketplaceProvider.DIGIKALA) return this.config.get("DIGIKALA_ENABLED", { infer: true });
    return false;
  }

  resolve(provider: MarketplaceProvider): SalesChannelAdapter {
    if (!this.isEnabled(provider)) throw new MarketplaceProviderDisabledException({ provider });
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new MarketplaceProviderUnavailableException({ provider });
    return adapter;
  }

  getCapabilities(provider: MarketplaceProvider): MarketplaceProviderCapabilities {
    return this.resolve(provider).capabilities;
  }

  /** Never lets orchestration code call an operation a provider doesn't support (spec section 22). */
  assertCapability(provider: MarketplaceProvider, capability: keyof MarketplaceProviderCapabilities): void {
    if (!this.getCapabilities(provider)[capability]) {
      throw new MarketplaceListingCapabilityUnsupportedException({ provider, capability });
    }
  }
}
