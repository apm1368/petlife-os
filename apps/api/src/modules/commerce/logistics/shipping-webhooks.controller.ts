import { BadRequestException, Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ShippingProvider, type ShipmentStatus } from "@prisma/client";
import type { AppEnv } from "../../../config/env";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { ShippingProviderDisabledException, ShippingWebhookInvalidException } from "../../../common/errors/api-exception";
import { ShippingProviderRegistry } from "./shipping-provider-registry.service";
import { ShippingOrchestrator } from "./shipping-orchestrator.service";
import { ShipmentEventsService } from "./shipment-events.service";
import { DevShippingAdapter } from "./dev-shipping.adapter";
import { SHIPPING_PROVIDER_SLUGS, ShippingWebhookDto } from "./dto/shipping.dto";

function resolveProviderSlug(slug: string): ShippingProvider {
  const provider = SHIPPING_PROVIDER_SLUGS[slug];
  if (!provider) throw new BadRequestException("Unsupported shipping provider");
  return provider;
}

/**
 * Provider webhook entry point (spec section 18) — no SessionAuthGuard: a
 * real courier calls this unauthenticated as itself, authenticated only by
 * its own signature (verified inside `gateway.handleWebhook`, mirroring
 * PaymentWebhooksController from Handoff 07). An unknown Shipment or an
 * unverifiable payload is acknowledged without mutating anything, never a
 * 5xx that could make a legitimate provider retry-storm this endpoint.
 */
@Controller("shipping")
export class ShippingWebhooksController {
  constructor(
    private readonly shippingProviders: ShippingProviderRegistry,
    private readonly orchestrator: ShippingOrchestrator,
    private readonly shipmentEvents: ShipmentEventsService,
    private readonly devAdapter: DevShippingAdapter,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Post("webhooks/:provider")
  async handleWebhook(@Param("provider") providerSlug: string, @Body() dto: ShippingWebhookDto) {
    const provider = resolveProviderSlug(providerSlug);
    const gateway = this.shippingProviders.resolve(provider);

    const result = await gateway.handleWebhook({ rawBody: dto, signatureHeader: undefined });
    if (!result.valid || !result.providerShipmentId) throw new ShippingWebhookInvalidException({ provider: providerSlug });

    const shipment = await this.orchestrator.findShipmentByProviderReference(provider, result.providerShipmentId);
    if (!shipment) {
      // Spec section 18: "unknown shipment must not crash webhook pipeline" — acknowledged, nothing mutated.
      return { received: true, processed: false, reason: "unknown_shipment" };
    }

    const occurredAt = result.occurredAt ?? new Date();
    const providerEventId = result.providerEventId ?? ShipmentEventsService.fingerprint(provider, result.providerShipmentId, result.eventType ?? "shipment.status_changed", occurredAt);

    const { isDuplicate } = await this.shipmentEvents.recordIfNew({
      shipmentId: shipment.id,
      provider,
      providerEventId,
      eventType: result.eventType ?? "shipment.status_changed",
      providerStatus: result.rawStatus,
      canonicalStatus: result.canonicalStatus ?? "UNKNOWN",
      occurredAt,
    });
    if (isDuplicate) return { received: true, processed: false, duplicate: true };

    const { applied } = await this.orchestrator.applyShipmentStatus(shipment.id, result.canonicalStatus ?? "UNKNOWN");
    return { received: true, processed: applied };
  }

  /**
   * Dev/test-only (spec section 13) — hard-disabled outside development/test
   * (NODE_ENV check, not just a soft config flag) so it can never be reached
   * in production regardless of misconfiguration. Builds a synthetic
   * webhook body via DevShippingAdapter and feeds it through the exact same
   * `handleWebhook` path above, so this genuinely exercises the real
   * pipeline rather than mutating state directly.
   */
  @Post("dev/simulate/:providerShipmentId")
  @UseGuards(SessionAuthGuard)
  async simulateDevEvent(@CurrentUser() _user: SessionUser, @Param("providerShipmentId") providerShipmentId: string, @Body() body: { toStatus?: string }) {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") throw new ShippingProviderDisabledException({ reason: "Dev simulation is never available in production" });
    if (!this.config.get("DEV_SHIPPING_ENABLED", { infer: true })) throw new ShippingProviderDisabledException({ provider: "DEV" });

    const toStatus = body.toStatus as ShipmentStatus | undefined;
    const payload = this.devAdapter.buildSimulatedEventPayload(providerShipmentId, toStatus);
    return this.handleWebhook("dev", payload as unknown as ShippingWebhookDto);
  }
}
