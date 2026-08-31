import { Injectable } from "@nestjs/common";
import { HouseholdRole, PetAccessSource } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";

const OWNER_PRESET: PetAccessFlags = {
  canViewIdentity: true,
  canEditIdentity: true,
  canViewHealth: true,
  canEditHealth: true,
  canBookCare: true,
  canViewCareProfile: true,
  canEditCareProfile: true,
  canViewLocation: true,
  canManageAccess: true,
};

const FAMILY_PRESET: PetAccessFlags = {
  canViewIdentity: true,
  canEditIdentity: false,
  canViewHealth: true,
  canEditHealth: false,
  canBookCare: true,
  canViewCareProfile: true,
  canEditCareProfile: false,
  canViewLocation: true,
  canManageAccess: false,
};

/**
 * HouseholdMember.role is only a preset used at grant time — PetAccess rows
 * are the actual authorization source of truth from then on, so revoking or
 * customizing one user's access never touches their household role.
 */
@Injectable()
export class PetAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async applyHouseholdDefaults(petId: string, householdId: string): Promise<void> {
    const members = await this.prisma.householdMember.findMany({ where: { householdId } });

    await this.prisma.petAccess.createMany({
      data: members.map((member) => ({
        petId,
        userId: member.userId,
        source: PetAccessSource.HOUSEHOLD,
        ...(member.role === HouseholdRole.OWNER ? OWNER_PRESET : FAMILY_PRESET),
      })),
      skipDuplicates: true,
    });
  }

  async listForPet(petId: string) {
    return this.prisma.petAccess.findMany({ where: { petId } });
  }
}
