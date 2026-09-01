import { Injectable } from "@nestjs/common";
import { ProviderVerificationStatus as PrismaVerificationStatus, ServiceCategory as PrismaServiceCategory } from "@prisma/client";
import { PetSpecies, ServiceCategory, type ServiceDetailDto, type ServiceSearchResultDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { toProviderLocationDto, toProviderServiceDto } from "../providers/provider-dto.mapper";
import { SlotGeneratorService } from "../providers/slot-generator.service";
import { PetServiceCompatibilityService } from "./pet-service-compatibility.service";
import type { SearchServicesDto } from "./dto/search-services.dto";
import type { GetServiceDetailDto } from "./dto/get-service-detail.dto";
import type { GetServiceAvailabilityDto } from "./dto/get-service-availability.dto";

/** The full canonical taxonomy — a static, stable list rather than "whatever categories currently have a live provider". */
const ALL_CATEGORIES: ServiceCategory[] = [
  ServiceCategory.VET,
  ServiceCategory.GROOMING,
  ServiceCategory.TRAINING,
  ServiceCategory.WALKING,
  ServiceCategory.SITTING,
  ServiceCategory.BOARDING,
  ServiceCategory.PET_TAXI,
];

/**
 * Consumer-facing, category-generic service discovery (Handoff 04) — the
 * marketplace-wide counterpart to ProvidersService's vet-only search. Results
 * are one row per (provider, service) pair, not per provider, since
 * different services from the same provider can have different pet
 * compatibility. No ranking complexity, same as ProvidersService.
 */
@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotGenerator: SlotGeneratorService,
    private readonly compatibility: PetServiceCompatibilityService,
    private readonly events: DomainEventsService,
  ) {}

  listCategories(): ServiceCategory[] {
    return ALL_CATEGORIES;
  }

  async search(query: SearchServicesDto): Promise<ServiceSearchResultDto[]> {
    const verifiedOnly = query.verifiedOnly !== "false";
    const pet = query.petId ? await this.prisma.pet.findUnique({ where: { id: query.petId } }) : null;

    const services = await this.prisma.providerService.findMany({
      where: {
        isActive: true,
        ...(query.category ? { category: query.category as unknown as PrismaServiceCategory } : {}),
        ...(query.species === PetSpecies.DOG ? { supportsDog: true } : {}),
        ...(query.species === PetSpecies.CAT ? { supportsCat: true } : {}),
        providerOrganization: {
          ...(verifiedOnly ? { verificationStatus: PrismaVerificationStatus.VERIFIED } : {}),
          ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
        },
        ...(query.city ? { location: { city: { equals: query.city, mode: "insensitive" } } } : {}),
      },
      include: { providerOrganization: true, location: true },
      orderBy: { name: "asc" },
    });

    return Promise.all(
      services.map(async (service) => {
        const nextAvailableSlotStart = service.locationId
          ? await this.cheapNextAvailableSlot(service.providerOrganizationId, service.locationId, service.id)
          : null;

        return {
          provider: {
            id: service.providerOrganization.id,
            name: service.providerOrganization.name,
            type: service.providerOrganization.type as unknown as ServiceSearchResultDto["provider"]["type"],
            verificationStatus: service.providerOrganization.verificationStatus as unknown as ServiceSearchResultDto["provider"]["verificationStatus"],
            description: service.providerOrganization.description,
            logoUrl: service.providerOrganization.logoUrl,
            locations: service.location ? [toProviderLocationDto(service.location)] : [],
            services: [],
            nextAvailableSlotStart,
          },
          service: toProviderServiceDto(service),
          location: service.location ? toProviderLocationDto(service.location) : null,
          compatibility: pet ? await this.compatibility.evaluate(pet, service) : null,
          nextAvailableSlotStart,
        };
      }),
    );
  }

  async getServiceDetail(serviceId: string, query: GetServiceDetailDto, viewerId?: string): Promise<ServiceDetailDto> {
    const service = await this.prisma.providerService.findUnique({
      where: { id: serviceId },
      include: { providerOrganization: { include: { locations: true, services: true } } },
    });
    if (!service) throw new NotFoundApiException("Service");

    const pet = query.petId ? await this.prisma.pet.findUnique({ where: { id: query.petId } }) : null;
    const compatibility = pet ? await this.compatibility.evaluate(pet, service) : null;

    if (viewerId) {
      await this.events.publish("ServiceViewed", { serviceId, viewerId }, { aggregateType: "ProviderService", aggregateId: serviceId });
      if (compatibility) {
        await this.events.publish(
          "ServiceCompatibilityEvaluated",
          { serviceId, petId: query.petId, status: compatibility.status, reasons: compatibility.reasons },
          { aggregateType: "ProviderService", aggregateId: serviceId },
        );
      }
    }

    const org = service.providerOrganization;
    return {
      provider: {
        id: org.id,
        name: org.name,
        type: org.type as unknown as ServiceDetailDto["provider"]["type"],
        verificationStatus: org.verificationStatus as unknown as ServiceDetailDto["provider"]["verificationStatus"],
        phone: org.phone,
        email: org.email,
        description: org.description,
        logoUrl: org.logoUrl,
        websiteUrl: org.websiteUrl,
        locations: org.locations.map(toProviderLocationDto),
        services: org.services.filter((s) => s.isActive).map(toProviderServiceDto),
      },
      service: toProviderServiceDto(service),
      locationOptions: service.locationId ? org.locations.filter((l) => l.id === service.locationId).map(toProviderLocationDto) : org.locations.map(toProviderLocationDto),
      compatibility,
    };
  }

  async getServiceAvailability(serviceId: string, query: GetServiceAvailabilityDto) {
    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundApiException("Service");

    const locationId = query.locationId ?? service.locationId;
    if (!locationId) throw new NotFoundApiException("Location");

    let petCompatible = true;
    if (query.petId) {
      const pet = await this.prisma.pet.findUnique({ where: { id: query.petId } });
      if (pet) petCompatible = (await this.compatibility.evaluate(pet, service)).status !== "NOT_SUPPORTED";
    }

    const slots = await this.slotGenerator.generate({
      providerOrganizationId: service.providerOrganizationId,
      locationId,
      serviceId,
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

  private async cheapNextAvailableSlot(providerOrganizationId: string, locationId: string, serviceId: string): Promise<string | null> {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    const slots = await this.slotGenerator.generate({ providerOrganizationId, locationId, serviceId, from, to });
    const next = slots.find((s) => s.state === "AVAILABLE");
    return next ? next.startAt.toISOString() : null;
  }
}
