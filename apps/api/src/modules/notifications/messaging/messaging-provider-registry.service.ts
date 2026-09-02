import { Injectable } from "@nestjs/common";
import { MessagingProvider } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { MessagingProviderDisabledException, MessagingProviderUnavailableException } from "../../../common/errors/api-exception";
import { DevMessagingAdapter } from "./dev-messaging.adapter";
import { FarazSmsAdapter } from "./faraz-sms.adapter";
import type { MessagingGateway } from "./messaging-gateway.interface";

/**
 * Resolves a `MessagingProvider` enum value to its adapter instance — mirrors
 * ShippingProviderRegistry/MarketplaceChannelRegistryService exactly. Every
 * caller (NotificationDeliveryService, the dev-simulate controller) goes
 * through this registry; no `if (provider === "FARAZ")` branch exists
 * anywhere outside this one file.
 */
@Injectable()
export class MessagingProviderRegistry {
  private readonly gateways: Map<MessagingProvider, MessagingGateway>;

  constructor(
    dev: DevMessagingAdapter,
    faraz: FarazSmsAdapter,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    this.gateways = new Map<MessagingProvider, MessagingGateway>([
      [MessagingProvider.DEV, dev],
      [MessagingProvider.FARAZ, faraz],
    ]);
  }

  isEnabled(provider: MessagingProvider): boolean {
    if (provider === MessagingProvider.DEV) return this.config.get("DEV_MESSAGING_ENABLED", { infer: true });
    if (provider === MessagingProvider.FARAZ) return this.config.get("FARAZ_SMS_ENABLED", { infer: true });
    return false;
  }

  resolve(provider: MessagingProvider): MessagingGateway {
    if (!this.isEnabled(provider)) throw new MessagingProviderDisabledException({ provider });
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new MessagingProviderUnavailableException({ provider });
    return gateway;
  }

  /** Resolves the active SMS provider from `MESSAGING_PROVIDER` (dev|faraz) — the one place that env var is read. */
  resolveActiveSmsProvider(): MessagingGateway {
    const configured = this.config.get("MESSAGING_PROVIDER", { infer: true });
    const provider = configured === "faraz" ? MessagingProvider.FARAZ : MessagingProvider.DEV;
    return this.resolve(provider);
  }
}
