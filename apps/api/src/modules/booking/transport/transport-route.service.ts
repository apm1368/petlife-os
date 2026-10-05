import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LocationMode, TransportDistanceSource, type ProviderService, type ServiceTransportPricing } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AddressRequiredException, NotFoundApiException, ServiceNotAvailableException } from "../../../common/errors/api-exception";
import type { AppEnv } from "../../../config/env";
import { computeTransportFare, straightLineMeters } from "./transport-fare.util";

export interface TransportRouteSnapshot {
  pickupAddressText: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddressText: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  distanceMeters: number | null;
  distanceSource: TransportDistanceSource;
  baseFareIrr: number | null;
  perKmRateIrr: number | null;
  serviceAdjustmentIrr: number | null;
  minimumFareIrr: number | null;
  estimatedFareIrr: number | null;
  distancePricingApplied: boolean;
}

/** Map provider status is reported with every quote so clients can show an honest state, never a fake map. */
export const MAP_PROVIDER_STATUS = "BLOCKED_EXTERNAL" as const;

/**
 * Pet taxi as a ride: the pickup and drop-off are copied from the household's saved addresses, the
 * distance comes from the configured source (none by default) and, when the provider has activated
 * distance pricing and a distance exists, the server computes the fare. Otherwise the ride keeps the
 * service's fixed price — nothing is guessed.
 */
@Injectable()
export class TransportRouteService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<AppEnv, true>) {}

  private formatAddress(a: { label: string | null; addressLine: string; region: string | null; city: string }) {
    return [a.label, a.addressLine, a.region, a.city].filter(Boolean).join("، ");
  }

  /** Both addresses must belong to the booking household; a foreign or missing id is the same refusal. */
  async resolve(householdId: string, pickupAddressId: string, dropoffAddressId: string) {
    const [pickup, dropoff] = await Promise.all([
      this.prisma.customerAddress.findFirst({ where: { id: pickupAddressId, householdId } }),
      this.prisma.customerAddress.findFirst({ where: { id: dropoffAddressId, householdId } }),
    ]);
    if (!pickup) throw new AddressRequiredException({ locationMode: LocationMode.TRANSPORT, field: "customerAddressId" });
    if (!dropoff) throw new AddressRequiredException({ locationMode: LocationMode.TRANSPORT, field: "dropoffAddressId" });
    return { pickup, dropoff };
  }

  distance(pickup: { latitude: number | null; longitude: number | null }, dropoff: { latitude: number | null; longitude: number | null }): { meters: number | null; source: TransportDistanceSource } {
    const mode = this.config.get("TRANSPORT_DISTANCE_MODE", { infer: true });
    const hasCoords = pickup.latitude !== null && pickup.longitude !== null && dropoff.latitude !== null && dropoff.longitude !== null;
    if (mode === "straight_line_demo" && hasCoords) {
      return { meters: straightLineMeters({ lat: pickup.latitude!, lng: pickup.longitude! }, { lat: dropoff.latitude!, lng: dropoff.longitude! }), source: TransportDistanceSource.STRAIGHT_LINE_DEMO };
    }
    return { meters: null, source: TransportDistanceSource.UNAVAILABLE };
  }

  async snapshot(service: Pick<ProviderService, "id">, householdId: string, pickupAddressId: string, dropoffAddressId: string): Promise<TransportRouteSnapshot> {
    const { pickup, dropoff } = await this.resolve(householdId, pickupAddressId, dropoffAddressId);
    const { meters, source } = this.distance(pickup, dropoff);
    const pricing: ServiceTransportPricing | null = await this.prisma.serviceTransportPricing.findUnique({ where: { providerServiceId: service.id } });
    const base = {
      pickupAddressText: this.formatAddress(pickup), pickupLat: pickup.latitude, pickupLng: pickup.longitude,
      dropoffAddressText: this.formatAddress(dropoff), dropoffLat: dropoff.latitude, dropoffLng: dropoff.longitude,
      distanceMeters: meters, distanceSource: source,
    };
    if (!pricing?.isActive || meters === null) {
      return { ...base, baseFareIrr: null, perKmRateIrr: null, serviceAdjustmentIrr: null, minimumFareIrr: null, estimatedFareIrr: null, distancePricingApplied: false };
    }
    const fare = computeTransportFare({ baseFareIrr: pricing.baseFareIrr, perKmRateIrr: pricing.perKmRateIrr, distanceMeters: meters, serviceAdjustmentIrr: pricing.serviceAdjustmentIrr, minimumFareIrr: pricing.minimumFareIrr });
    return { ...base, baseFareIrr: fare.baseFareIrr, perKmRateIrr: pricing.perKmRateIrr, serviceAdjustmentIrr: fare.serviceAdjustmentIrr, minimumFareIrr: fare.minimumFareIrr, estimatedFareIrr: fare.estimatedFareIrr, distancePricingApplied: true };
  }

  /** A pre-booking estimate for the member's own saved addresses. */
  async quote(userId: string, serviceId: string, pickupAddressId: string, dropoffAddressId: string) {
    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId } });
    if (!service || !service.isActive) throw new NotFoundApiException("Service");
    if (service.locationMode !== LocationMode.TRANSPORT) throw new ServiceNotAvailableException({ serviceId, reason: "NOT_A_TRANSPORT_SERVICE" });
    const address = await this.prisma.customerAddress.findUnique({ where: { id: pickupAddressId }, select: { householdId: true } });
    const member = address ? await this.prisma.householdMember.findFirst({ where: { householdId: address.householdId, userId } }) : null;
    if (!address || !member) throw new AddressRequiredException({ locationMode: LocationMode.TRANSPORT, field: "customerAddressId" });
    const snap = await this.snapshot(service, address.householdId, pickupAddressId, dropoffAddressId);
    const pricingRow = await this.prisma.serviceTransportPricing.findUnique({ where: { providerServiceId: service.id }, select: { isActive: true } });
    // Honest state for the UI: no active tariff is NOT_CONFIGURED (never a made-up fare); an active tariff
    // without a measurable distance is DISTANCE_UNAVAILABLE.
    const pricingStatus = snap.distancePricingApplied ? "CONFIGURED" : !pricingRow?.isActive ? "NOT_CONFIGURED" : "DISTANCE_UNAVAILABLE";
    const fixed = service.priceAmount === null ? null : Number(service.priceAmount);
    return {
      pricingStatus,
      /** What estimatedFareIrr is based on: the distance tariff, the provider's own fixed service price, or nothing. */
      estimateBasis: snap.distancePricingApplied ? "DISTANCE_TARIFF" : fixed === null ? "NONE" : "SERVICE_FIXED_PRICE",
      serviceId,
      mapProvider: MAP_PROVIDER_STATUS,
      distanceSource: snap.distanceSource,
      distanceMeters: snap.distanceMeters,
      distancePricingApplied: snap.distancePricingApplied,
      pricing: snap.distancePricingApplied ? { baseFareIrr: snap.baseFareIrr, perKmRateIrr: snap.perKmRateIrr, serviceAdjustmentIrr: snap.serviceAdjustmentIrr, minimumFareIrr: snap.minimumFareIrr } : null,
      estimatedFareIrr: snap.distancePricingApplied ? snap.estimatedFareIrr : fixed,
      pickup: { text: snap.pickupAddressText, lat: snap.pickupLat, lng: snap.pickupLng },
      dropoff: { text: snap.dropoffAddressText, lat: snap.dropoffLat, lng: snap.dropoffLng },
    };
  }
}
