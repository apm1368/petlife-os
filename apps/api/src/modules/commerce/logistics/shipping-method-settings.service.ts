import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, ShippingProvider, ShippingQuoteStatus } from "@prisma/client";
import type { AdminShippingMethodDto, AdminShippingOverviewDto, OpetlifeCourierConfig, PostPishtazConfig } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import { courierConfigUsable, parseCourierConfig, parsePostConfig, postConfigUsable } from "./shipping-pricing.policy";

/** Couriers priced by opetlife's distance/city rules: its own riders, and Snappbox/Alopeyk booked by staff in their regular app. */
export const COURIER_STYLE_PROVIDERS: ReadonlySet<ShippingProvider> = new Set([ShippingProvider.OPETLIFE_COURIER, ShippingProvider.SNAPPBOX_APP, ShippingProvider.ALOPEYK_APP]);
/** Methods opetlife prices and runs itself (no courier API, staff move the shipment). */
export const MANUAL_PROVIDERS: ReadonlySet<ShippingProvider> = new Set([...COURIER_STYLE_PROVIDERS, ShippingProvider.POST_PISHTAZ]);
/** The order methods are offered in. */
export const METHOD_ORDER: ShippingProvider[] = [
  ShippingProvider.OPETLIFE_COURIER,
  ShippingProvider.SNAPPBOX_APP,
  ShippingProvider.ALOPEYK_APP,
  ShippingProvider.SNAPPBOX,
  ShippingProvider.ALOPEYK,
  ShippingProvider.POST_PISHTAZ,
  ShippingProvider.DEV,
];

/**
 * Staff-managed shipping methods. A manual method (opetlife courier, Post Pishtaz) is offered only when staff switch it
 * on with a usable price. An API courier also needs its env flag (and, in production, credentials); its staff switch
 * defaults to on and can only take it out of checkout.
 */
@Injectable()
export class ShippingMethodSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private envEnabled(provider: ShippingProvider): boolean {
    if (provider === ShippingProvider.DEV) return this.config.get("DEV_SHIPPING_ENABLED", { infer: true }) && this.mode() === "sandbox";
    if (provider === ShippingProvider.ALOPEYK) return this.config.get("ALOPEYK_ENABLED", { infer: true });
    if (provider === ShippingProvider.SNAPPBOX) return this.config.get("SNAPPBOX_ENABLED", { infer: true });
    return true;
  }

  mode(): "sandbox" | "production" {
    return this.config.get("SHIPPING_MODE", { infer: true }) === "production" ? "production" : "sandbox";
  }

  async rows() {
    const rows = await this.prisma.shippingMethodSetting.findMany();
    return new Map(rows.map((r) => [r.provider, r]));
  }

  /** Distance/city pricing for opetlife's own couriers, or for Snappbox/Alopeyk booked in their app. */
  async courierConfig(provider: ShippingProvider = ShippingProvider.OPETLIFE_COURIER): Promise<{ enabled: boolean; config: OpetlifeCourierConfig }> {
    const row = await this.prisma.shippingMethodSetting.findUnique({ where: { provider } });
    const config = parseCourierConfig(row?.config);
    return { enabled: !!row?.enabled && courierConfigUsable(config), config };
  }

  async postConfig(): Promise<{ enabled: boolean; config: PostPishtazConfig }> {
    const row = await this.prisma.shippingMethodSetting.findUnique({ where: { provider: ShippingProvider.POST_PISHTAZ } });
    const config = parsePostConfig(row?.config);
    return { enabled: !!row?.enabled && postConfigUsable(config), config };
  }

  /** Providers that may be quoted for a seller right now: platform-active, then narrowed to what the seller offers. */
  async providersFor(sellerOrgId: string): Promise<Set<ShippingProvider>> {
    const [active, profile] = await Promise.all([this.activeProviders(), this.prisma.sellerShippingProfile.findUnique({ where: { sellerOrganizationId: sellerOrgId } })]);
    const offered = profile?.offeredProviders ?? [];
    return new Set([...active].filter((p) => !offered.length || offered.includes(p)));
  }

  async activeProviders(): Promise<Set<ShippingProvider>> {
    const rows = await this.rows();
    const active = new Set<ShippingProvider>();
    for (const provider of METHOD_ORDER) {
      const row = rows.get(provider);
      if (COURIER_STYLE_PROVIDERS.has(provider)) {
        if (row?.enabled && courierConfigUsable(parseCourierConfig(row.config))) active.add(provider);
      } else if (provider === ShippingProvider.POST_PISHTAZ) {
        if (row?.enabled && postConfigUsable(parsePostConfig(row.config))) active.add(provider);
      } else if (this.envEnabled(provider) && (row?.enabled ?? true)) {
        active.add(provider);
      }
    }
    return active;
  }

  async overview(): Promise<AdminShippingOverviewDto> {
    const rows = await this.rows();
    const active = await this.activeProviders();
    const mode = this.mode();
    const secret = (key: "ALOPEYK_WEBHOOK_SECRET" | "SNAPPBOX_WEBHOOK_SECRET") => (this.config.get(key, { infer: true })?.trim().length ?? 0) >= 32;
    const methods: AdminShippingMethodDto[] = METHOD_ORDER.filter((p) => p !== ShippingProvider.DEV || this.envEnabled(p)).map((provider) => {
      const row = rows.get(provider);
      const manual = MANUAL_PROVIDERS.has(provider);
      let note: string | null = null;
      if (manual) {
        const usable = COURIER_STYLE_PROVIDERS.has(provider) ? courierConfigUsable(parseCourierConfig(row?.config)) : postConfigUsable(parsePostConfig(row?.config));
        if (!usable) note = "NEEDS_PRICE";
        else if (!row?.enabled) note = "SWITCHED_OFF";
      } else if (!this.envEnabled(provider)) note = "DISABLED_IN_ENV";
      else if (row && !row.enabled) note = "SWITCHED_OFF";
      else if (mode === "sandbox") note = "SANDBOX";
      return {
        provider: provider as unknown as AdminShippingMethodDto["provider"],
        enabled: manual ? !!row?.enabled : (row?.enabled ?? true),
        active: active.has(provider),
        note,
        kind: manual ? "MANUAL" : "API",
        config: COURIER_STYLE_PROVIDERS.has(provider) ? parseCourierConfig(row?.config) : provider === ShippingProvider.POST_PISHTAZ ? parsePostConfig(row?.config) : {},
        webhookSecretConfigured: provider === ShippingProvider.ALOPEYK ? secret("ALOPEYK_WEBHOOK_SECRET") : provider === ShippingProvider.SNAPPBOX ? secret("SNAPPBOX_WEBHOOK_SECRET") : null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
    return { mode, methods };
  }

  /** Writes one method's switch and rules; the caller audits it in the same transaction. */
  async update(tx: Prisma.TransactionClient, adminUserId: string, provider: ShippingProvider, input: { enabled: boolean; config?: unknown }) {
    let config: Prisma.InputJsonValue = {};
    if (COURIER_STYLE_PROVIDERS.has(provider)) {
      const parsed = parseCourierConfig(input.config);
      if (input.enabled && !courierConfigUsable(parsed)) throw new ValidationApiException({ field: "config", reason: "NEEDS_PRICE" });
      config = parsed as unknown as Prisma.InputJsonValue;
    } else if (provider === ShippingProvider.POST_PISHTAZ) {
      const parsed = parsePostConfig(input.config);
      if (input.enabled && !postConfigUsable(parsed)) throw new ValidationApiException({ field: "config", reason: "NEEDS_PRICE" });
      config = parsed as unknown as Prisma.InputJsonValue;
    }
    const before = await tx.shippingMethodSetting.findUnique({ where: { provider } });
    const after = await tx.shippingMethodSetting.upsert({
      where: { provider },
      create: { provider, enabled: input.enabled, config, updatedByAdminId: adminUserId },
      update: { enabled: input.enabled, config, updatedByAdminId: adminUserId },
    });
    // New prices or a method switched off: quotes not yet paid for stop being valid now, so checkout asks the member
    // to refresh instead of charging an old price (a selected one is refused at payment, see CheckoutService).
    const now = new Date();
    await tx.shippingQuote.updateMany({ where: { provider, orderId: null, status: { in: [ShippingQuoteStatus.AVAILABLE, ShippingQuoteStatus.SELECTED] }, expiresAt: { gt: now } }, data: { expiresAt: now } });
    return { before, after };
  }
}
