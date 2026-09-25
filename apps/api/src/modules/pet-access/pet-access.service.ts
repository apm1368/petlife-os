import { Injectable } from "@nestjs/common";
import { HouseholdRole, PetAccessSource, type Pet, type Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HouseholdAccessDeniedException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { PrismaService } from "../../common/prisma/prisma.service";

const OWNER_PRESET: PetAccessFlags = {
  canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true,
  canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: true, canRecordClinicalData: false,
};
const FAMILY_PRESET: PetAccessFlags = {
  canViewIdentity: true, canEditIdentity: false, canViewHealth: true, canEditHealth: false, canBookCare: true,
  canViewCareProfile: true, canEditCareProfile: false, canViewLocation: true, canManageAccess: false, canRecordClinicalData: false,
};
const NO_ACCESS_PRESET: PetAccessFlags = {
  canViewIdentity: false, canEditIdentity: false, canViewHealth: false, canEditHealth: false, canBookCare: false,
  canViewCareProfile: false, canEditCareProfile: false, canViewLocation: false, canManageAccess: false, canRecordClinicalData: false,
};
const FLAG_KEYS = Object.keys(NO_ACCESS_PRESET) as (keyof PetAccessFlags)[];
type Grant = { startsAt: Date | null; expiresAt: Date | null; revokedAt: Date | null } & PetAccessFlags;
type QueryClient = PrismaService | Prisma.TransactionClient;

function isGrantActive(grant: Pick<Grant, "startsAt" | "expiresAt" | "revokedAt">, now: Date): boolean {
  if (grant.revokedAt !== null) return false;
  if (grant.startsAt && grant.startsAt > now) return false;
  if (grant.expiresAt && grant.expiresAt <= now) return false;
  return true;
}

@Injectable()
export class PetAccessService {
  constructor(private readonly prisma: PrismaService, private readonly events?: DomainEventsService) {}

  async applyHouseholdDefaults(petId: string, householdId: string, client: QueryClient = this.prisma): Promise<void> {
    const members = await client.householdMember.findMany({ where: { householdId } });
    if (!members.length) return;
    const existing = await client.petAccessGrant.findMany({ where: { petId, userId: { in: members.map((m) => m.userId) }, source: PetAccessSource.HOUSEHOLD } });
    const now = new Date();
    const activeUsers = new Set(existing.filter((grant) => isGrantActive(grant, now)).map((grant) => grant.userId));
    const missing = members.filter((member) => !activeUsers.has(member.userId));
    if (!missing.length) return;
    await client.petAccessGrant.createMany({ data: missing.map((member) => ({ petId, userId: member.userId, source: PetAccessSource.HOUSEHOLD, ...(member.role === HouseholdRole.OWNER ? OWNER_PRESET : FAMILY_PRESET) })) });
  }

  async getEffectivePermissions(petId: string, userId: string, client: QueryClient = this.prisma): Promise<PetAccessFlags | null> {
    const grants = await client.petAccessGrant.findMany({ where: { petId, userId } });
    const active = grants.filter((grant) => isGrantActive(grant, new Date()));
    if (!active.length) return null;
    return active.reduce<PetAccessFlags>((union, grant) => {
      const next = { ...union };
      for (const key of FLAG_KEYS) next[key] = union[key] || grant[key];
      return next;
    }, NO_ACCESS_PRESET);
  }

  async hasActiveAccess(petId: string, userId: string, client: QueryClient = this.prisma): Promise<boolean> {
    return (await this.getEffectivePermissions(petId, userId, client)) !== null;
  }

  async findAccessiblePet(petId: string | undefined, userId: string | undefined, client: QueryClient = this.prisma): Promise<Pet | null> {
    if (!petId || !userId || !(await this.getEffectivePermissions(petId, userId, client))) return null;
    return client.pet.findUnique({ where: { id: petId } });
  }

  async listForPet(petId: string) { return this.prisma.petAccessGrant.findMany({ where: { petId } }); }

  async listManagedForPet(petId: string) {
    const grants = await this.prisma.petAccessGrant.findMany({
      where: { petId },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    return grants.map((grant) => ({ ...grant, active: isGrantActive(grant, now) }));
  }

  async createGrant(
    petId: string,
    targetUserId: string,
    actorUserId: string,
    flags: PetAccessFlags,
    timing: { startsAt?: string; expiresAt?: string; reason?: string },
  ) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");
    const member = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: pet.householdId, userId: targetUserId } } });
    if (!member) throw new HouseholdAccessDeniedException();
    if (member.role === HouseholdRole.OWNER) throw new ValidationApiException({ field: "userId", reason: "Owner access cannot be replaced." });
    await this.assertNoEscalation(petId, actorUserId, flags);
    const startsAt = timing.startsAt ? new Date(timing.startsAt) : null;
    const expiresAt = timing.expiresAt ? new Date(timing.expiresAt) : null;
    if (startsAt && expiresAt && startsAt >= expiresAt) throw new ValidationApiException({ field: "expiresAt", reason: "Expiry must be after start." });
    const grant = await this.prisma.petAccessGrant.create({
      data: { petId, userId: targetUserId, ...flags, startsAt, expiresAt, reason: timing.reason, source: expiresAt ? PetAccessSource.TEMPORARY : PetAccessSource.MANUAL, grantedByUserId: actorUserId },
    });
    await this.events?.publish("PetAccessGranted", { petId, grantId: grant.id, actorUserId, targetUserId, expiresAt }, { aggregateType: "Pet", aggregateId: petId });
    return grant;
  }

  async updateGrant(petId: string, grantId: string, actorUserId: string, input: Partial<PetAccessFlags> & { startsAt?: string; expiresAt?: string; reason?: string }) {
    const grant = await this.prisma.petAccessGrant.findFirst({ where: { id: grantId, petId, revokedAt: null } });
    if (!grant) throw new NotFoundApiException("Access grant");
    const targetMembership = await this.prisma.householdMember.findFirst({ where: { userId: grant.userId, household: { pets: { some: { id: petId } } } }, select: { role: true } });
    if (targetMembership?.role === HouseholdRole.OWNER) throw new ValidationApiException({ field: "grantId", reason: "Owner access cannot be changed." });
    const { startsAt, expiresAt, reason, ...partialFlags } = input;
    const nextFlags = Object.fromEntries(FLAG_KEYS.map((key) => [key, partialFlags[key] ?? grant[key]])) as unknown as PetAccessFlags;
    await this.assertNoEscalation(petId, actorUserId, nextFlags);
    const nextStart = startsAt ? new Date(startsAt) : grant.startsAt;
    const nextExpiry = expiresAt ? new Date(expiresAt) : grant.expiresAt;
    if (nextStart && nextExpiry && nextStart >= nextExpiry) throw new ValidationApiException({ field: "expiresAt", reason: "Expiry must be after start." });
    const updated = await this.prisma.petAccessGrant.update({ where: { id: grantId }, data: { ...partialFlags, startsAt: nextStart, expiresAt: nextExpiry, reason } });
    await this.events?.publish("PetAccessChanged", { petId, grantId, actorUserId, targetUserId: grant.userId }, { aggregateType: "Pet", aggregateId: petId });
    return updated;
  }

  async revokeGrant(petId: string, grantId: string, actorUserId: string) {
    const grant = await this.prisma.petAccessGrant.findFirst({ where: { id: grantId, petId, revokedAt: null }, include: { user: { select: { householdMemberships: { where: { household: { pets: { some: { id: petId } } } }, select: { role: true } } } } } });
    if (!grant) throw new NotFoundApiException("Access grant");
    if (grant.user.householdMemberships.some((membership) => membership.role === HouseholdRole.OWNER)) throw new ValidationApiException({ field: "grantId", reason: "Owner access cannot be revoked." });
    await this.prisma.petAccessGrant.update({ where: { id: grantId }, data: { revokedAt: new Date(), revokedByUserId: actorUserId } });
    await this.events?.publish("PetAccessRevoked", { petId, grantId, actorUserId, targetUserId: grant.userId }, { aggregateType: "Pet", aggregateId: petId });
    return { ok: true };
  }

  private async assertNoEscalation(petId: string, actorUserId: string, requested: PetAccessFlags) {
    const actor = await this.getEffectivePermissions(petId, actorUserId);
    if (!actor?.canManageAccess) throw new HouseholdAccessDeniedException();
    for (const key of FLAG_KEYS) {
      if (requested[key] && !actor[key]) throw new ValidationApiException({ field: key, reason: "Cannot grant a permission you do not hold." });
    }
  }
}

export type { Grant as PetAccessGrantRow };
export { isGrantActive };
