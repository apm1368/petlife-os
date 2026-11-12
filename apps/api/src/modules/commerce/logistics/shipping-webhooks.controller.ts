import { BadRequestException, Body, Controller, Headers, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { ShippingProvider, type ShipmentStatus } from "@prisma/client";
import type { AppEnv } from "../../../config/env";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { devSimulationAllowed } from "../../../common/dev/dev-simulation";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { ShippingProviderDisabledException, ShippingWebhookInvalidException } from "../../../common/errors/api-exception";
import { ShippingProviderRegistry } from "./shipping-provider-registry.service";
import { ShippingOrchestrator } from "./shipping-orchestrator.service";
import { ShipmentEventsService } from "./shipment-events.service";
import { DevShippingAdapter } from "./dev-shipping.adapter";
import { SHIPPING_PROVIDER_SLUGS, ShippingWebhookDto } from "./dto/shipping.dto";
import { verifyShippingWebhook } from "./shipping-webhook-signature";

function resolveProviderSlug(slug: string): ShippingProvider {
  const provider = SHIPPING_PROVIDER_SLUGS[slug];
  if (!provider) throw new BadRequestException("Unsupported shipping provider");
  return provider;
}

/**
 * Provider webhook entry point (spec section 18) — no SessionAuthGuard: a
 * real courier calls this unauthenticated as itself, authenticated only by
 * its own webhook secret (HMAC of the raw body, or a callback token — see
 * shipping-webhook-signature.ts), checked here before any adapter runs. An unknown Shipment or an
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

  private webhookSecret(provider: ShippingProvider): string | undefined {
    if (provider === ShippingProvider.ALOPEYK) return this.config.get("ALOPEYK_WEBHOOK_SECRET", { infer: true });
    if (provider === ShippingProvider.SNAPPBOX) return this.config.get("SNAPPBOX_WEBHOOK_SECRET", { infer: true });
    return undefined;
  }

  @Post("webhooks/:provider")
  async handleWebhook(
    @Param("provider") providerSlug: string,
    @Body() dto: ShippingWebhookDto,
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-webhook-signature") signatureHeader?: string,
    @Headers("x-webhook-token") tokenHeader?: string,
    @Query("token") queryToken?: string,
  ) {
    const provider = resolveProviderSlug(providerSlug);
    if (this.config.get("SHIPPING_MODE", { infer: true }) === "production") {
      // A real courier proves itself with its own webhook secret; the dev courier never exists in production.
      const genuine = provider !== ShippingProvider.DEV && verifyShippingWebhook({ secret: this.webhookSecret(provider), rawBody: req.rawBody, signatureHeader, token: tokenHeader ?? queryToken });
      if (!genuine) throw new ShippingWebhookInvalidException({ provider: providerSlug, reason: "SIGNATURE_INVALID" });
    } else if (!devSimulationAllowed(this.config)) {
      // Sandbox adapters accept unsigned bodies; outside an explicit dev-simulation server nobody may post them.
      throw new ShippingWebhookInvalidException({ provider: providerSlug, reason: "SANDBOX_WEBHOOKS_DISABLED" });
    }
    return this.process(provider, providerSlug, dto, signatureHeader);
  }

  private async process(provider: ShippingProvider, providerSlug: string, dto: ShippingWebhookDto, signatureHeader?: string) {
    const gateway = this.shippingProviders.resolve(provider);

    const result = await gateway.handleWebhook({ rawBody: dto, signatureHeader });
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
    if (!devSimulationAllowed(this.config)) throw new ShippingProviderDisabledException({ reason: "Dev simulation is not enabled on this server" });
    if (!this.config.get("DEV_SHIPPING_ENABLED", { infer: true })) throw new ShippingProviderDisabledException({ provider: "DEV" });

    const toStatus = body.toStatus as ShipmentStatus | undefined;
    const payload = this.devAdapter.buildSimulatedEventPayload(providerShipmentId, toStatus);
    return this.process(ShippingProvider.DEV, "dev", payload as unknown as ShippingWebhookDto);
  }
}
