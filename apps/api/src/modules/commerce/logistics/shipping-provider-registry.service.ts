import { Injectable } from "@nestjs/common";
import { ShippingProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { ShippingProviderDisabledException, ShippingProviderUnavailableException } from "../../../common/errors/api-exception";
import { DevShippingAdapter } from "./dev-shipping.adapter";
import { AloPeykAdapter } from "./alopeyk.adapter";
import { SnappBoxAdapter } from "./snappbox.adapter";
import { AlopeykAppAdapter, OpetlifeCourierAdapter, PostPishtazAdapter, SnappboxAppAdapter } from "./manual-shipping.adapters";
import { MANUAL_PROVIDERS } from "./shipping-method-settings.service";
import type { ShippingGateway } from "./shipping-gateway.interface";

/**
 * Resolves a `ShippingProvider` enum value to its adapter instance (spec
 * section 11) — mirrors PaymentGatewayRegistry (Handoff 07) exactly. Every
 * caller (ShippingOrchestrator, the webhooks controller, reconciliation)
 * goes through this registry; no `if (provider === ...)` branch exists
 * anywhere outside this one file.
 */
@Injectable()
export class ShippingProviderRegistry {
  private readonly gateways: Map<ShippingProvider, ShippingGateway>;

  constructor(
    dev: DevShippingAdapter,
    alopeyk: AloPeykAdapter,
    snappbox: SnappBoxAdapter,
    courier: OpetlifeCourierAdapter,
    post: PostPishtazAdapter,
    snappboxApp: SnappboxAppAdapter,
    alopeykApp: AlopeykAppAdapter,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    this.gateways = new Map<ShippingProvider, ShippingGateway>([
      [ShippingProvider.DEV, dev],
      [ShippingProvider.ALOPEYK, alopeyk],
      [ShippingProvider.SNAPPBOX, snappbox],
      [ShippingProvider.OPETLIFE_COURIER, courier],
      [ShippingProvider.POST_PISHTAZ, post],
      [ShippingProvider.SNAPPBOX_APP, snappboxApp],
      [ShippingProvider.ALOPEYK_APP, alopeykApp],
    ]);
  }

  isEnabled(provider: ShippingProvider): boolean {
    if (provider === ShippingProvider.DEV) return this.config.get("DEV_SHIPPING_ENABLED", { infer: true });
    if (provider === ShippingProvider.ALOPEYK) return this.config.get("ALOPEYK_ENABLED", { infer: true });
    if (provider === ShippingProvider.SNAPPBOX) return this.config.get("SNAPPBOX_ENABLED", { infer: true });
    // Staff-run methods stay resolvable so their existing shipments can be moved; whether they are offered in
    // checkout is the staff switch, checked by the adapter's quote.
    if (MANUAL_PROVIDERS.has(provider)) return true;
    return false;
  }

  resolve(provider: ShippingProvider): ShippingGateway {
    if (!this.isEnabled(provider)) throw new ShippingProviderDisabledException({ provider });
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new ShippingProviderUnavailableException({ provider });
    return gateway;
  }

  listEnabled(): ShippingGateway[] {
    return [...this.gateways.values()].filter((gateway) => this.isEnabled(gateway.provider));
  }
}
