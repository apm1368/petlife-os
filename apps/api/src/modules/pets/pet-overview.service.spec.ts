import type { PetAccessFlags } from "@petlife/types";
import { PetOverviewService } from "./pet-overview.service";

const identityOnly: PetAccessFlags = {
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
};

function petRow() {
  return {
    id: "pet-1",
    householdId: "household-1",
    household: { name: "خانه لونا" },
    name: "لونا",
    species: "DOG",
    breed: "Mixed",
    sex: "FEMALE",
    birthDate: new Date("2021-01-01"),
    approximateAgeMonths: null,
    photoUrl: null,
    latestWeightValue: { toNumber: () => 12.5 },
    latestWeightUnit: "KG",
    colorMarkings: null,
    neuteredStatus: "NEUTERED",
    microchipNumber: null,
    lifecycleStatus: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };
}

describe("PetOverviewService", () => {
  it("does not query or disclose health/care rows without the matching grant", async () => {
    const prisma = {
      pet: { findUnique: jest.fn().mockResolvedValue(petRow()) },
      petMemory: { findFirst: jest.fn().mockResolvedValue(null) },
      careCalendarEvent: { findMany: jest.fn() },
      healthProfile: { findUnique: jest.fn() },
      vaccinationSummary: { findUnique: jest.fn() },
    };
    const service = new PetOverviewService(prisma as never);

    const result = await service.get("pet-1", identityOnly);

    expect(result.pet.id).toBe("pet-1");
    expect(result.recentHealth).toEqual([]);
    expect(result.upcoming).toEqual([]);
    expect(prisma.careCalendarEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.healthProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.vaccinationSummary.findUnique).not.toHaveBeenCalled();
  });

  it("keeps incomplete health distinct from a healthy state", async () => {
    const prisma = {
      pet: { findUnique: jest.fn().mockResolvedValue(petRow()) },
      petMemory: { findFirst: jest.fn().mockResolvedValue(null) },
      careCalendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      healthProfile: { findUnique: jest.fn().mockResolvedValue({ status: "PARTIAL" }) },
      vaccinationSummary: { findUnique: jest.fn().mockResolvedValue({ status: "UNKNOWN", nextDueDate: null }) },
      carePlanItem: { findMany: jest.fn().mockResolvedValue([]) },
      clinicalVisit: { findMany: jest.fn().mockResolvedValue([]) },
      labResult: { findMany: jest.fn().mockResolvedValue([]) },
      medicalDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PetOverviewService(prisma as never);

    const result = await service.get("pet-1", {
      ...identityOnly,
      canViewHealth: true,
      canBookCare: true,
    });

    expect(result.attention).toContainEqual(expect.objectContaining({
      id: "health-incomplete",
      severity: "INFORMATIONAL",
    }));
    expect(result.attention.some((item) => item.title.includes("HEALTHY"))).toBe(false);
  });
});
