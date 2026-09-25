import { LocationMode, PetAccessSource, ProviderServiceType, ProviderType, ProviderVerificationStatus, ServiceCategory, type Pet, type ProviderService } from "@prisma/client";
import { PetAccessService } from "../pet-access/pet-access.service";
import { PetServiceCompatibilityService } from "./pet-service-compatibility.service";
import { ProvidersService } from "../providers/providers.service";

const pet = { id: "pet-1", species: "DOG", birthDate: null, approximateAgeMonths: 24, latestWeightValue: null, latestWeightUnit: null } as unknown as Pet;
const service = {
  id: "service-1",
  providerOrganizationId: "provider-1",
  locationId: "location-1",
  name: "Cats only",
  type: ProviderServiceType.CONSULTATION,
  category: ServiceCategory.VET,
  durationMinutes: 30,
  priceAmount: 1000,
  currency: "IRR",
  locationMode: LocationMode.AT_PROVIDER,
  supportsDog: false,
  supportsCat: true,
  isActive: true,
  minAgeMonths: null,
  maxAgeMonths: null,
  minWeightKg: null,
  maxWeightKg: null,
  requiresCareProfile: false,
  requiresHealthBasics: false,
} as unknown as ProviderService;

describe("public discovery pet privacy", () => {
  it("resolves a pet only for an authenticated owner or grant holder", async () => {
    const prisma = {
      petAccessGrant: {
        findMany: jest.fn(({ where }: { where: { userId: string } }) => {
          if (where.userId === "owner" || where.userId === "granted") {
            return [{
              startsAt: null,
              expiresAt: null,
              revokedAt: null,
              source: PetAccessSource.HOUSEHOLD,
              canViewIdentity: true,
              canEditIdentity: false,
              canViewHealth: false,
              canEditHealth: false,
              canBookCare: false,
              canViewCareProfile: false,
              canEditCareProfile: false,
              canViewLocation: false,
              canManageAccess: false,
              canRecordClinicalData: false,
            }];
          }
          return [];
        }),
      },
      pet: { findUnique: jest.fn().mockResolvedValue(pet) },
    };
    const access = new PetAccessService(prisma as never);

    await expect(access.findAccessiblePet("pet-1", undefined)).resolves.toBeNull();
    await expect(access.findAccessiblePet("pet-1", "stranger")).resolves.toBeNull();
    await expect(access.findAccessiblePet("pet-1", "owner")).resolves.toBe(pet);
    await expect(access.findAccessiblePet("pet-1", "granted")).resolves.toBe(pet);
    expect(prisma.pet.findUnique).toHaveBeenCalledTimes(2);
  });

  it("returns no compatibility for anonymous/unrelated viewers and evaluates owner/granted viewers", async () => {
    const access = { findAccessiblePet: jest.fn((_petId: string, viewerId?: string) => Promise.resolve(viewerId === "owner" || viewerId === "granted" ? pet : null)) };
    const compatibility = new PetServiceCompatibilityService({} as never, access as never);

    await expect(compatibility.evaluateForViewer("pet-1", service, undefined)).resolves.toBeNull();
    await expect(compatibility.evaluateForViewer("pet-1", service, "stranger")).resolves.toBeNull();
    await expect(compatibility.evaluateForViewer("pet-1", service, "owner")).resolves.toEqual({ status: "NOT_SUPPORTED", reasons: ["SPECIES_UNSUPPORTED"] });
    await expect(compatibility.evaluateForViewer("pet-1", service, "granted")).resolves.toEqual({ status: "NOT_SUPPORTED", reasons: ["SPECIES_UNSUPPORTED"] });
  });

  it("constrains vet discovery to vet organizations with active VET services", async () => {
    const prisma = { providerOrganization: { findMany: jest.fn().mockResolvedValue([]) } };
    const providers = new ProvidersService(prisma as never, {} as never, {} as never, {} as never);
    await providers.searchVets({});

    expect(prisma.providerOrganization.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: { in: [ProviderType.VET_CLINIC, ProviderType.VET_HOSPITAL, ProviderType.VETERINARIAN] },
        verificationStatus: ProviderVerificationStatus.VERIFIED,
        services: { some: expect.objectContaining({ isActive: true, category: ServiceCategory.VET }) },
      }),
    }));
  });
});
