import { PetAccessSource } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { PetAccessService, isGrantActive } from "./pet-access.service";

const FLAGS: PetAccessFlags = {
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

describe("canonical pet access security", () => {
  it("enforces start, expiry and revocation on the backend", () => {
    const now = new Date("2026-09-25T10:00:00Z");
    expect(isGrantActive({ startsAt: null, expiresAt: null, revokedAt: null }, now)).toBe(true);
    expect(isGrantActive({ startsAt: new Date("2026-09-25T11:00:00Z"), expiresAt: null, revokedAt: null }, now)).toBe(false);
    expect(isGrantActive({ startsAt: null, expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(isGrantActive({ startsAt: null, expiresAt: null, revokedAt: now }, now)).toBe(false);
  });

  it("returns no effective permission after a temporary grant expires", async () => {
    const prisma = {
      petAccessGrant: {
        findMany: jest.fn().mockResolvedValue([{ ...FLAGS, startsAt: null, expiresAt: new Date(Date.now() - 1000), revokedAt: null, source: PetAccessSource.TEMPORARY }]),
      },
    };
    const service = new PetAccessService(prisma as never);
    await expect(service.getEffectivePermissions("pet-1", "user-1")).resolves.toBeNull();
  });

  it("unions only active grants without inventing permissions", async () => {
    const prisma = {
      petAccessGrant: {
        findMany: jest.fn().mockResolvedValue([
          { ...FLAGS, startsAt: null, expiresAt: null, revokedAt: null, source: PetAccessSource.HOUSEHOLD },
          { ...FLAGS, canViewHealth: true, startsAt: null, expiresAt: new Date(Date.now() + 60_000), revokedAt: null, source: PetAccessSource.TEMPORARY },
        ]),
      },
    };
    const service = new PetAccessService(prisma as never);
    const effective = await service.getEffectivePermissions("pet-1", "user-1");
    expect(effective?.canViewIdentity).toBe(true);
    expect(effective?.canViewHealth).toBe(true);
    expect(effective?.canEditHealth).toBe(false);
    expect(effective?.canManageAccess).toBe(false);
  });
});
