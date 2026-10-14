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
const CREATOR_IDENTITY_PRESET: PetAccessFlags = {
  canViewIdentity: true, canEditIdentity: true, canViewHealth: false, canEditHealth: false, canBookCare: false,
  canViewCareProfile: false, canEditCareProfile: false, canViewLocation: false, canManageAccess: false, canRecordClinicalData: false,
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

/** Reasons the system writes for its own grants; they change how a grant is read, so clients can't set them. */
function isSystemReason(reason: string): boolean {
  return reason === "EXPLICIT_VET_SHARE" || reason.endsWith("_BOOKING");
}

function assertWithinActorExpiry(expiresAt: Date | null, actorExpiry: Date | null) {
  if (!actorExpiry) return;
  if (!expiresAt || expiresAt > actorExpiry) {
    throw new ValidationApiException({ field: "expiresAt", reason: "Access you grant cannot outlast your own access.", maxExpiresAt: actorExpiry.toISOString() });
  }
}

@Injectable()
export class PetAccessService {
  constructor(private readonly prisma: PrismaService, private readonly events?: DomainEventsService) {}

  /**
   * Automatic grants for a newly created pet. Only household OWNERs get access automatically (the full owner
   * preset); membership alone never implies seeing health, location, documents or managing care — an owner
   * shares those explicitly. A FAMILY member who created the pet themselves gets identity only (see and edit
   * the pet's profile), so they are not locked out of what they just added.
   */
  async applyHouseholdDefaults(petId: string, householdId: string, creatorUserId: string, client: QueryClient = this.prisma): Promise<void> {
    const members = await client.householdMember.findMany({ where: { householdId } });
    const recipients = members
      .map((member) => member.role === HouseholdRole.OWNER ? { userId: member.userId, flags: OWNER_PRESET } : member.userId === creatorUserId ? { userId: member.userId, flags: CREATOR_IDENTITY_PRESET } : null)
      .filter((r): r is { userId: string; flags: PetAccessFlags } => r !== null);
    if (!recipients.length) return;
    const existing = await client.petAccessGrant.findMany({ where: { petId, userId: { in: recipients.map((r) => r.userId) }, source: PetAccessSource.HOUSEHOLD } });
    const now = new Date();
    const activeUsers = new Set(existing.filter((grant) => isGrantActive(grant, now)).map((grant) => grant.userId));
    const missing = recipients.filter((r) => !activeUsers.has(r.userId));
    if (!missing.length) return;
    await client.petAccessGrant.createMany({ data: missing.map((r) => ({ petId, userId: r.userId, source: PetAccessSource.HOUSEHOLD, ...r.flags })) });
  }

  async getEffectivePermissions(petId: string, userId: string, client: QueryClient = this.prisma): Promise<PetAccessFlags | null> {
    const grants = await client.petAccessGrant.findMany({ where: { petId, userId } });
    // Granular vet shares are usable only through the scope-enforcing read API.
    const active = grants.filter((grant) => grant.reason !== "EXPLICIT_VET_SHARE" && isGrantActive(grant, new Date()));
    if (!active.length) return null;
    return active.reduce<PetAccessFlags>((union, grant) => {
      const next = { ...union };
      for (const key of FLAG_KEYS) {
        // Booking grants without recorded owner consent (including all pre-consent legacy rows) never read or
        // edit health; clinical recording for the visit window stays operational.
        const bookingHealth = grant.reason?.endsWith("_BOOKING") && (key === "canViewHealth" || key === "canEditHealth");
        next[key] = union[key] || (!bookingHealth && grant[key]);
      }
      return next;
    }, NO_ACCESS_PRESET);
  }

  async hasActiveAccess(petId: string, userId: string, client: QueryClient = this.prisma): Promise<boolean> {
    return (await this.getEffectivePermissions(petId, userId, client)) !== null;
  }

  /**
   * Batch 8 — why someone who once had access no longer does, so the product
   * can say "your access expired" / "was revoked" instead of a generic error.
   * Only ever describes the caller's own grants; a stranger gets null.
   */
  async describeLapse(petId: string, userId: string): Promise<{ reason: "EXPIRED" | "REVOKED" | "NOT_STARTED"; at: string } | null> {
    const grants = await this.prisma.petAccessGrant.findMany({ where: { petId, userId }, orderBy: { updatedAt: "desc" }, take: 20 });
    const now = new Date();
    const upcoming = grants.find((g) => !g.revokedAt && g.startsAt && g.startsAt > now);
    if (upcoming) return { reason: "NOT_STARTED", at: upcoming.startsAt!.toISOString() };
    const ended = grants
      .map((g) => (g.revokedAt ? { reason: "REVOKED" as const, at: g.revokedAt } : g.expiresAt && g.expiresAt <= now ? { reason: "EXPIRED" as const, at: g.expiresAt } : null))
      .filter((x): x is { reason: "EXPIRED" | "REVOKED"; at: Date } => x !== null)
      .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    return ended ? { reason: ended.reason, at: ended.at.toISOString() } : null;
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
    if (targetUserId === actorUserId) throw new ValidationApiException({ field: "userId", reason: "You cannot grant access to yourself." });
    if (timing.reason && isSystemReason(timing.reason)) throw new ValidationApiException({ field: "reason", reason: "This reason is reserved for system grants." });
    const actorExpiry = await this.assertNoEscalation(petId, actorUserId, flags);
    const startsAt = timing.startsAt ? new Date(timing.startsAt) : null;
    const expiresAt = timing.expiresAt ? new Date(timing.expiresAt) : null;
    if (startsAt && expiresAt && startsAt >= expiresAt) throw new ValidationApiException({ field: "expiresAt", reason: "Expiry must be after start." });
    assertWithinActorExpiry(expiresAt, actorExpiry);
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
    if (grant.userId === actorUserId) throw new ValidationApiException({ field: "grantId", reason: "You cannot change your own access." });
    const { startsAt, expiresAt, reason, ...partialFlags } = input;
    // A grant's reason carries meaning (booking grants never read health, vet shares only work through the
    // scoped API), so it is fixed at creation; re-sending the same value is accepted.
    if (reason !== undefined && reason !== grant.reason) throw new ValidationApiException({ field: "reason", reason: "A grant's reason cannot be changed." });
    const nextFlags = Object.fromEntries(FLAG_KEYS.map((key) => [key, partialFlags[key] ?? grant[key]])) as unknown as PetAccessFlags;
    const actorExpiry = await this.assertNoEscalation(petId, actorUserId, nextFlags);
    const nextStart = startsAt ? new Date(startsAt) : grant.startsAt;
    const nextExpiry = expiresAt ? new Date(expiresAt) : grant.expiresAt;
    if (nextStart && nextExpiry && nextStart >= nextExpiry) throw new ValidationApiException({ field: "expiresAt", reason: "Expiry must be after start." });
    assertWithinActorExpiry(nextExpiry, actorExpiry);
    const updated = await this.prisma.petAccessGrant.update({ where: { id: grantId }, data: { ...partialFlags, startsAt: nextStart, expiresAt: nextExpiry } });
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

  /**
   * The actor may only hand out permissions they hold, and never for longer than their own ability to manage
   * access lasts. Returns that limit: null when the actor's manage access does not expire.
   */
  private async assertNoEscalation(petId: string, actorUserId: string, requested: PetAccessFlags): Promise<Date | null> {
    const actor = await this.getEffectivePermissions(petId, actorUserId);
    if (!actor?.canManageAccess) throw new HouseholdAccessDeniedException();
    for (const key of FLAG_KEYS) {
      if (requested[key] && !actor[key]) throw new ValidationApiException({ field: key, reason: "Cannot grant a permission you do not hold." });
    }
    const now = new Date();
    const managing = (await this.prisma.petAccessGrant.findMany({ where: { petId, userId: actorUserId, canManageAccess: true } }))
      .filter((grant) => grant.reason !== "EXPLICIT_VET_SHARE" && isGrantActive(grant, now));
    if (managing.some((grant) => grant.expiresAt === null)) return null;
    return new Date(Math.max(...managing.map((grant) => grant.expiresAt!.getTime())));
  }
}

export type { Grant as PetAccessGrantRow };
export { isGrantActive };
