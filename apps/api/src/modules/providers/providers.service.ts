import { Injectable } from "@nestjs/common";
import { ProviderVerificationStatus as PrismaVerificationStatus, type Prisma, type ProviderLocation, type ProviderOrganization, type ProviderService, type ProviderServiceType as PrismaServiceType } from "@prisma/client";
import type {
  AvailabilityResponseDto,
  ProviderLocationDto,
  ProviderProfileDto,
  ProviderServiceDto,
  ProviderSummaryDto,
} from "@petlife/types";
import { PetSpecies } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { SearchVetsDto } from "./dto/search-vets.dto";
import type { GetAvailabilityDto } from "./dto/get-availability.dto";
import { SlotGeneratorService } from "./slot-generator.service";

function toLocationDto(location: ProviderLocation): ProviderLocationDto {
  return {
    id: location.id,
    providerOrganizationId: location.providerOrganizationId,
    name: location.name,
    addressLine: location.addressLine,
    city: location.city,
    region: location.region,
    countryCode: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
    phone: location.phone,
    timezone: location.timezone,
  };
}

function toServiceDto(service: ProviderService): ProviderServiceDto {
  return {
    id: service.id,
    providerOrganizationId: service.providerOrganizationId,
    locationId: service.locationId,
    name: service.name,
    description: service.description,
    type: service.type as ProviderServiceDto["type"],
    durationMinutes: service.durationMinutes,
    priceAmount: service.priceAmount ? Number(service.priceAmount) : null,
    currency: service.currency,
    supportsDog: service.supportsDog,
    supportsCat: service.supportsCat,
    isActive: service.isActive,
  };
}

type OrgWithRelations = ProviderOrganization & { locations: ProviderLocation[]; services: ProviderService[] };

/**
 * Consumer-facing provider discovery + profile + availability. Deliberately
 * no ranking complexity (per spec) — results are ordered by name, filtered
 * to VERIFIED providers by default.
 */
@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotGenerator: SlotGeneratorService,
    private readonly events: DomainEventsService,
  ) {}

  async searchVets(query: SearchVetsDto): Promise<ProviderSummaryDto[]> {
    const verifiedOnly = query.verifiedOnly !== "false";

    const where: Prisma.ProviderOrganizationWhereInput = {
      ...(verifiedOnly ? { verificationStatus: PrismaVerificationStatus.VERIFIED } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
      ...(query.city ? { locations: { some: { city: { equals: query.city, mode: "insensitive" } } } } : {}),
      services: {
        some: {
          isActive: true,
          ...(query.serviceType ? { type: query.serviceType as unknown as PrismaServiceType } : {}),
          ...(query.species === PetSpecies.DOG ? { supportsDog: true } : {}),
          ...(query.species === PetSpecies.CAT ? { supportsCat: true } : {}),
        },
      },
    };

    const organizations = await this.prisma.providerOrganization.findMany({
      where,
      include: { locations: true, services: true },
      orderBy: { name: "asc" },
    });

    return Promise.all(organizations.map((org) => this.toSummaryDto(org, query.city)));
  }

  async getVetProfile(providerId: string, viewerId?: string): Promise<ProviderProfileDto> {
    const org = await this.prisma.providerOrganization.findUnique({
      where: { id: providerId },
      include: { locations: true, services: true },
    });
    if (!org) throw new NotFoundApiException("Provider");

    if (viewerId) {
      await this.events.publish("ProviderViewed", { providerId, viewerId }, { aggregateType: "ProviderOrganization", aggregateId: providerId });
    }

    return {
      id: org.id,
      name: org.name,
      type: org.type as ProviderProfileDto["type"],
      verificationStatus: org.verificationStatus as ProviderProfileDto["verificationStatus"],
      phone: org.phone,
      email: org.email,
      description: org.description,
      logoUrl: org.logoUrl,
      websiteUrl: org.websiteUrl,
      locations: org.locations.map(toLocationDto),
      services: org.services.filter((s) => s.isActive).map(toServiceDto),
    };
  }

  async getAvailability(providerId: string, query: GetAvailabilityDto): Promise<AvailabilityResponseDto> {
    const service = await this.prisma.providerService.findUnique({ where: { id: query.serviceId } });
    if (!service || service.providerOrganizationId !== providerId) throw new NotFoundApiException("Service");

    let petCompatible = true;
    if (query.petId) {
      const pet = await this.prisma.pet.findUnique({ where: { id: query.petId } });
      if (pet) {
        petCompatible = pet.species === "DOG" ? service.supportsDog : pet.species === "CAT" ? service.supportsCat : true;
      }
    }

    const slots = await this.slotGenerator.generate({
      providerOrganizationId: providerId,
      locationId: query.locationId,
      serviceId: query.serviceId,
      providerUserId: query.providerUserId,
      from: new Date(query.from),
      to: new Date(query.to),
    });

    return {
      petCompatible,
      slots: slots.map((slot) => ({
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        timezone: slot.timezone,
        state: slot.state,
        providerUserId: slot.providerUserId,
      })),
    };
  }

  private async toSummaryDto(org: OrgWithRelations, cityFilter?: string): Promise<ProviderSummaryDto> {
    const locations = cityFilter
      ? org.locations.filter((l) => l.city.toLowerCase() === cityFilter.toLowerCase())
      : org.locations;
    const services = org.services.filter((s) => s.isActive);

    const nextAvailableSlotStart = await this.cheapNextAvailableSlot(org.id, locations[0]?.id, services[0]?.id);

    return {
      id: org.id,
      name: org.name,
      type: org.type as ProviderSummaryDto["type"],
      verificationStatus: org.verificationStatus as ProviderSummaryDto["verificationStatus"],
      description: org.description,
      logoUrl: org.logoUrl,
      locations: locations.map(toLocationDto),
      services: services.map(toServiceDto),
      nextAvailableSlotStart,
    };
  }

  /** Cheap-to-compute per spec — only the first location/service, one week out, first AVAILABLE slot. Never a ranking signal. */
  private async cheapNextAvailableSlot(providerOrganizationId: string, locationId?: string, serviceId?: string): Promise<string | null> {
    if (!locationId || !serviceId) return null;
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const slots = await this.slotGenerator.generate({ providerOrganizationId, locationId, serviceId, from, to });
    const next = slots.find((s) => s.state === "AVAILABLE");
    return next ? next.startAt.toISOString() : null;
  }
}
