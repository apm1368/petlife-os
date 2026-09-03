import { Injectable } from "@nestjs/common";
import { HouseholdRole, PetAccessSource, type Prisma } from "@prisma/client";
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
  canRecordClinicalData: false,
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
  canRecordClinicalData: false,
};

const NO_ACCESS_PRESET: PetAccessFlags = {
  canViewIdentity: false,
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

const FLAG_KEYS = Object.keys(NO_ACCESS_PRESET) as (keyof PetAccessFlags)[];

type Grant = {
  startsAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
} & PetAccessFlags;

/** A DB-level query client — either the default PrismaService or a $transaction callback's tx. */
type QueryClient = PrismaService | Prisma.TransactionClient;

function isGrantActive(grant: Pick<Grant, "startsAt" | "expiresAt" | "revokedAt">, now: Date): boolean {
  if (grant.revokedAt !== null) return false;
  if (grant.startsAt && grant.startsAt > now) return false;
  if (grant.expiresAt && grant.expiresAt <= now) return false;
  return true;
}

/**
 * HouseholdMember.role is only a preset applied when a HOUSEHOLD-sourced
 * grant is created — PetAccessGrant rows are the actual authorization
 * source of truth from then on. A user may hold multiple simultaneous,
 * independent grants for the same pet (household + a temporary vet grant,
 * for example); effective authorization is the boolean OR of every
 * currently active, non-revoked grant's flags. See getEffectivePermissions.
 */
@Injectable()
export class PetAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures every current household member has an active HOUSEHOLD-sourced
   * grant for this pet. Idempotent: a member who already has one active
   * HOUSEHOLD grant is skipped rather than accumulating duplicates — grants
   * have no unique constraint, so nothing else would stop that.
   */
  async applyHouseholdDefaults(petId: string, householdId: string, client: QueryClient = this.prisma): Promise<void> {
    const members = await client.householdMember.findMany({ where: { householdId } });
    if (members.length === 0) return;

    const existingHouseholdGrants = await client.petAccessGrant.findMany({
      where: { petId, userId: { in: members.map((m) => m.userId) }, source: PetAccessSource.HOUSEHOLD },
    });
    const now = new Date();
    const membersWithActiveGrant = new Set(
      existingHouseholdGrants.filter((g) => isGrantActive(g, now)).map((g) => g.userId),
    );

    const toCreate = members.filter((member) => !membersWithActiveGrant.has(member.userId));
    if (toCreate.length === 0) return;

    await client.petAccessGrant.createMany({
      data: toCreate.map((member) => ({
        petId,
        userId: member.userId,
        source: PetAccessSource.HOUSEHOLD,
        ...(member.role === HouseholdRole.OWNER ? OWNER_PRESET : FAMILY_PRESET),
      })),
    });
  }

  /**
   * The effective-authorization algorithm: fetch every grant for (petId,
   * userId), keep only those currently active (not revoked, within their
   * start/expiry window), and OR their flags together. Returns null when
   * there is no active grant at all — callers use that to distinguish "no
   * access whatsoever" from "access, but missing one specific capability".
   */
  async getEffectivePermissions(
    petId: string,
    userId: string,
    client: QueryClient = this.prisma,
  ): Promise<PetAccessFlags | null> {
    const grants = await client.petAccessGrant.findMany({ where: { petId, userId } });
    const now = new Date();
    const active = grants.filter((grant) => isGrantActive(grant, now));
    if (active.length === 0) return null;

    return active.reduce<PetAccessFlags>((union, grant) => {
      const next = { ...union };
      for (const key of FLAG_KEYS) {
        next[key] = union[key] || grant[key];
      }
      return next;
    }, NO_ACCESS_PRESET);
  }

  async hasActiveAccess(petId: string, userId: string, client: QueryClient = this.prisma): Promise<boolean> {
    return (await this.getEffectivePermissions(petId, userId, client)) !== null;
  }

  async listForPet(petId: string) {
    return this.prisma.petAccessGrant.findMany({ where: { petId } });
  }
}

export type { Grant as PetAccessGrantRow };
export { isGrantActive };
