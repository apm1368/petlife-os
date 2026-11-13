import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ShipmentStatus, ShippingProvider } from "@prisma/client";
import type {
  CancelShipmentResult,
  CreateShipmentInput,
  CreateShipmentResult,
  ShipmentStatusResult,
  ShippingGateway,
  ShippingQuoteRequestInput,
  ShippingQuoteRequestResult,
  ShippingWebhookInput,
  ShippingWebhookResult,
} from "./shipping-gateway.interface";
import { SHIPPING_PROVIDER_CAPABILITIES } from "./shipping-provider-registry";
import { ShippingMethodSettingsService } from "./shipping-method-settings.service";
import { quoteCourier, quotePost } from "./shipping-pricing.policy";

const QUOTE_MINUTES = 30;

/**
 * opetlife's own couriers. The price comes from staff rules (distance when both sides have a map point, otherwise a
 * city fare); "booking" creates the shipment for dispatch, and staff move it through its statuses in the back office.
 * There is no courier API, so there are no webhooks and nothing to query.
 */
@Injectable()
export class OpetlifeCourierAdapter implements ShippingGateway {
  readonly provider: ShippingProvider = ShippingProvider.OPETLIFE_COURIER;
  readonly capabilities = SHIPPING_PROVIDER_CAPABILITIES[ShippingProvider.OPETLIFE_COURIER];
  protected readonly idPrefix: string = "opl";

  constructor(protected readonly methods: ShippingMethodSettingsService) {}

  async getQuote(input: ShippingQuoteRequestInput): Promise<ShippingQuoteRequestResult> {
    const { enabled, config } = await this.methods.courierConfig(this.provider);
    if (!enabled) return { status: "UNAVAILABLE", quotes: [], unavailableReason: "NOT_ENABLED" };
    const quote = quoteCourier(config, input.pickupAddress, input.deliveryAddress);
    if (!quote.available) return { status: "UNAVAILABLE", quotes: [], unavailableReason: quote.reason };
    return {
      status: "AVAILABLE",
      quotes: [{ serviceLevel: "COURIER", priceIrr: quote.priceIrr, estimatedPickupMinutes: quote.pickupMinutes, estimatedDeliveryMinutes: quote.deliveryMinutes, providerQuoteId: `${this.idPrefix}-quote-${randomUUID()}`, expiresInMinutes: QUOTE_MINUTES, pricingBasis: quote.basis }],
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    void input;
    return { status: "CREATED", providerShipmentId: `${this.idPrefix}-${randomUUID()}` };
  }

  async getShipmentStatus(_providerShipmentId: string): Promise<ShipmentStatusResult> {
    return { rawStatus: "staff_managed", canonicalStatus: ShipmentStatus.UNKNOWN };
  }

  async cancelShipment(_providerShipmentId: string): Promise<CancelShipmentResult> {
    return { status: "CANCELED" };
  }

  async handleWebhook(_input: ShippingWebhookInput): Promise<ShippingWebhookResult> {
    return { valid: false };
  }
}

/**
 * Iran Post express (Pishtaz). No API: the price is the fixed one staff set (plus per extra kilo), and after the
 * seller hands the parcel to the post office staff enter its Post tracking number and move its status.
 */
@Injectable()
export class PostPishtazAdapter implements ShippingGateway {
  readonly provider = ShippingProvider.POST_PISHTAZ;
  readonly capabilities = SHIPPING_PROVIDER_CAPABILITIES[ShippingProvider.POST_PISHTAZ];

  constructor(private readonly methods: ShippingMethodSettingsService) {}

  async getQuote(input: ShippingQuoteRequestInput): Promise<ShippingQuoteRequestResult> {
    const { enabled, config } = await this.methods.postConfig();
    if (!enabled) return { status: "UNAVAILABLE", quotes: [], unavailableReason: "NOT_ENABLED" };
    const quote = quotePost(config, input.shippingPackage.weightGrams);
    if (!quote) return { status: "UNAVAILABLE", quotes: [], unavailableReason: "NOT_PRICED" };
    return {
      status: "AVAILABLE",
      // A fixed tariff does not go stale like a courier's live quote; it is still re-read at refresh.
      quotes: [{ serviceLevel: "POST_PISHTAZ", priceIrr: quote.priceIrr, estimatedPickupMinutes: 24 * 60, estimatedDeliveryMinutes: quote.deliveryMinutes, providerQuoteId: `post-quote-${randomUUID()}`, expiresInMinutes: 24 * 60, pricingBasis: "FIXED_PRICE" }],
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    void input;
    return { status: "CREATED", providerShipmentId: `post-${randomUUID()}` };
  }

  async getShipmentStatus(_providerShipmentId: string): Promise<ShipmentStatusResult> {
    return { rawStatus: "staff_managed", canonicalStatus: ShipmentStatus.UNKNOWN };
  }

  async cancelShipment(_providerShipmentId: string): Promise<CancelShipmentResult> {
    return { status: "CANCELED" };
  }

  async handleWebhook(_input: ShippingWebhookInput): Promise<ShippingWebhookResult> {
    return { valid: false };
  }
}

/**
 * Snappbox booked by staff in its regular app (the owner's choice until a business API contract exists): the member
 * pays opetlife's distance/city estimate for it, staff book the courier in the app, then enter its tracking link and
 * move the status here. Nothing logs in to Snappbox on our behalf.
 */
@Injectable()
export class SnappboxAppAdapter extends OpetlifeCourierAdapter {
  override readonly provider = ShippingProvider.SNAPPBOX_APP;
  override readonly capabilities = SHIPPING_PROVIDER_CAPABILITIES[ShippingProvider.SNAPPBOX_APP];
  protected override readonly idPrefix = "snappbox-app";
}

/** Alopeyk booked by staff in its regular app; same flow as SnappboxAppAdapter. */
@Injectable()
export class AlopeykAppAdapter extends OpetlifeCourierAdapter {
  override readonly provider = ShippingProvider.ALOPEYK_APP;
  override readonly capabilities = SHIPPING_PROVIDER_CAPABILITIES[ShippingProvider.ALOPEYK_APP];
  protected override readonly idPrefix = "alopeyk-app";
}
