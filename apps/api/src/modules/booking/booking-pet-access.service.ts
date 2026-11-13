import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PetAccessSource, type Booking, type Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { LocationMode, PetAccessScopePreset, ServiceCategory } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { AppEnv } from "../../config/env";

/**
 * What each preset actually exposes. HEALTH_BASICS matches the Handoff 03
 * spec's recommended vet default exactly. SELECTED_HEALTH_DATA is not yet
 * distinct from HEALTH_BASICS — there is no per-field health-data selection
 * UI or API this phase (HealthSummaryService returns one derived summary,
 * not addressable per-allergy/per-medication toggles) — see README Known
 * limitations. MINIMAL_VET_CONTEXT never includes health or care-profile
 * access at all.
 *
 * The *_BASIC presets (Handoff 04) are Care-Profile-only by default — a
 * groomer/trainer/walker/sitter/taxi driver never sees health data unless
 * the pet's booking explicitly requires it. BOARDING_BASIC is the one
 * exception: canViewHealth is granted because boarding requirements
 * routinely include "vaccination status where applicable" (spec section 6)
 * and there is no narrower, field-level scope in this phase — the same
 * limitation already noted for SELECTED_HEALTH_DATA.
 *
 * canViewLocation is deliberately NOT part of this table — it is computed
 * per booking from the service's LocationMode (see grantForBooking below),
 * since "the provider needs to see the customer's address" is a fact about
 * where the service happens, not about which category it is.
 */
const SCOPE_PRESET_FLAGS: Record<
  PetAccessScopePreset,
  Omit<PetAccessFlags, "canManageAccess" | "canViewLocation" | "canEditIdentity" | "canBookCare" | "canRecordClinicalData">
> = {
  [PetAccessScopePreset.MINIMAL_VET_CONTEXT]: {
    canViewIdentity: true,
    canViewHealth: false,
    canEditHealth: false,
    canViewCareProfile: false,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.HEALTH_BASICS]: {
    canViewIdentity: true,
    canViewHealth: true,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.SELECTED_HEALTH_DATA]: {
    canViewIdentity: true,
    canViewHealth: true,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.GROOMING_BASIC]: {
    canViewIdentity: true,
    canViewHealth: false,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.TRAINING_BASIC]: {
    canViewIdentity: true,
    canViewHealth: false,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.WALKING_BASIC]: {
    canViewIdentity: true,
    canViewHealth: false,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.SITTING_BASIC]: {
    canViewIdentity: true,
    canViewHealth: false,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.BOARDING_BASIC]: {
    canViewIdentity: true,
    canViewHealth: true,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [PetAccessScopePreset.TAXI_BASIC]: {
    canViewIdentity: true,
    canViewHealth: false,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
};

/** Whether a preset can read health at all (only with the owner's explicit choice — see grantForBooking). */
export function presetIncludesHealth(preset: PetAccessScopePreset): boolean {
  return SCOPE_PRESET_FLAGS[preset].canViewHealth;
}

/** The default preset per category when a booking doesn't explicitly choose one (never "full record" by default). */
export const DEFAULT_SCOPE_PRESET_BY_CATEGORY: Record<ServiceCategory, PetAccessScopePreset> = {
  [ServiceCategory.VET]: PetAccessScopePreset.HEALTH_BASICS,
  [ServiceCategory.GROOMING]: PetAccessScopePreset.GROOMING_BASIC,
  [ServiceCategory.TRAINING]: PetAccessScopePreset.TRAINING_BASIC,
  [ServiceCategory.WALKING]: PetAccessScopePreset.WALKING_BASIC,
  [ServiceCategory.SITTING]: PetAccessScopePreset.SITTING_BASIC,
  [ServiceCategory.BOARDING]: PetAccessScopePreset.BOARDING_BASIC,
  [ServiceCategory.PET_TAXI]: PetAccessScopePreset.TAXI_BASIC,
  // Least privilege for uncategorized services: identity only, no health or care profile.
  [ServiceCategory.OTHER]: PetAccessScopePreset.MINIMAL_VET_CONTEXT,
};

/** Renamed from BookingHealthAccessService (Handoff 03) now that booking-time access spans every service category. */
@Injectable()
export class BookingPetAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Records the owner's access decision for this booking and, when a specific provider staff member is
   * already assigned, issues their independent TEMPORARY PetAccessGrant — never touching or overwriting the
   * household's own standing grant, per the grant-union model (see the schema-hardening checkpoint).
   * startsAt is the moment of booking confirmation; expiresAt is the booking's end time plus a buffer
   * (default 24h, same rule for a 30-minute vet visit and a multi-day Boarding stay — see README "Access
   * expiry"). An "any staff" booking keeps the decision on its BookingPetAccess row with no grant yet:
   * the person the clinic assigns receives exactly that decision (see followAssignee).
   */
  async grantForBooking(
    booking: Booking,
    providerUserId: string | undefined,
    scopePreset: PetAccessScopePreset,
    tx: Prisma.TransactionClient,
    ownerChoseScope = false,
    sharedDocumentIds: string[] = [],
  ): Promise<void> {
    // A booking alone never opens the medical record: health reading requires the owner to have
    // explicitly chosen a health scope in the booking flow (a category default is not consent).
    const healthConsented = ownerChoseScope && SCOPE_PRESET_FLAGS[scopePreset].canViewHealth;
    const consent = { scopePreset, healthConsented };
    const providerUser = providerUserId ? await tx.providerUser.findFirst({ where: { id: providerUserId, removedAt: null } }) : null;
    const grant = providerUser ? await this.issueGrant(booking, providerUser.userId, consent, tx) : null;

    await tx.bookingPetAccess.create({
      // Documents are health data: they travel only with health consent.
      data: { bookingId: booking.id, petAccessGrantId: grant?.id ?? null, scopePreset, healthConsented, sharedDocumentIds: healthConsented ? [...new Set(sharedDocumentIds)] : [] },
    });
    if (grant) await this.publishGranted(booking, grant.id, scopePreset, tx);
  }

  /**
   * The booking's access follows the person it is assigned to. Called after a clinic assigns, reassigns or
   * unassigns a booking: the previous assignee's grant is revoked (they keep any other grant they hold) and
   * the new assignee receives one with exactly the owner's recorded scope and the booking's expiry. Nothing
   * is issued once the owner has withdrawn this booking's access themselves, or after the access window.
   */
  async followAssignee(booking: Booking, actorUserId: string, tx: Prisma.TransactionClient): Promise<void> {
    const existing = await tx.bookingPetAccess.findUnique({ where: { bookingId: booking.id }, include: { petAccessGrant: true } });
    // Bookings made before "any staff" bookings kept their decision: the category default, never health.
    const link = existing ?? (await tx.bookingPetAccess.create({
      data: { bookingId: booking.id, scopePreset: DEFAULT_SCOPE_PRESET_BY_CATEGORY[booking.category as unknown as ServiceCategory], healthConsented: false },
      include: { petAccessGrant: true },
    }));
    const current = link.petAccessGrant;
    const assignee = booking.providerUserId ? await tx.providerUser.findFirst({ where: { id: booking.providerUserId, removedAt: null } }) : null;
    if (current && !current.revokedAt && current.userId === assignee?.userId) return;

    if (current?.revokedAt && current.revokedByUserId) {
      // The owner (or anyone in the pet's household) ended this booking's access: no one receives it again.
      const withdrawnByHousehold = await tx.householdMember.count({ where: { householdId: booking.householdId, userId: current.revokedByUserId } });
      if (withdrawnByHousehold) return;
    }
    if (current && !current.revokedAt) {
      await tx.petAccessGrant.update({ where: { id: current.id }, data: { revokedAt: new Date(), revokedByUserId: actorUserId } });
      await this.events.publish("ServiceAccessRevoked", { bookingId: booking.id, grantId: current.id, reason: "REASSIGNED" }, { tx, aggregateType: "PetAccessGrant", aggregateId: current.id });
    }
    if (!assignee || this.expiryFor(booking) <= new Date()) return;

    const scopePreset = link.scopePreset as unknown as PetAccessScopePreset;
    const grant = await this.issueGrant(booking, assignee.userId, { scopePreset, healthConsented: link.healthConsented }, tx);
    await tx.bookingPetAccess.update({ where: { id: link.id }, data: { petAccessGrantId: grant.id } });
    await this.publishGranted(booking, grant.id, scopePreset, tx);
  }

  /**
   * Revokes the grant this booking created, if any (a booking with no assigned provider user has none yet).
   * Soft-revoke only — the row (and BookingPetAccess audit link) is preserved, per the same revocation
   * convention as every other PetAccessGrant. An already-revoked grant keeps its original revocation.
   */
  async revokeForBooking(bookingId: string, revokedByUserId: string, tx: Prisma.TransactionClient): Promise<void> {
    const link = await tx.bookingPetAccess.findUnique({ where: { bookingId } });
    if (!link?.petAccessGrantId) return;

    const revoked = await tx.petAccessGrant.updateMany({
      where: { id: link.petAccessGrantId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByUserId },
    });
    if (!revoked.count) return;

    await this.events.publish(
      "ServiceAccessRevoked",
      { bookingId, grantId: link.petAccessGrantId },
      { tx, aggregateType: "PetAccessGrant", aggregateId: link.petAccessGrantId },
    );
  }

  private expiryFor(booking: Booking): Date {
    const bufferHours = this.config.get("BOOKING_HEALTH_ACCESS_BUFFER_HOURS", { infer: true });
    return new Date(booking.endAt.getTime() + bufferHours * 60 * 60 * 1000);
  }

  private issueGrant(booking: Booking, userId: string, consent: { scopePreset: PetAccessScopePreset; healthConsented: boolean }, tx: Prisma.TransactionClient) {
    const flags = SCOPE_PRESET_FLAGS[consent.scopePreset];
    const healthConsented = consent.healthConsented && flags.canViewHealth;
    return tx.petAccessGrant.create({
      data: {
        petId: booking.petId,
        userId,
        canViewIdentity: flags.canViewIdentity,
        canEditIdentity: false,
        canViewHealth: healthConsented,
        canEditHealth: false,
        canBookCare: false,
        canViewCareProfile: flags.canViewCareProfile,
        canEditCareProfile: flags.canEditCareProfile,
        canViewLocation: booking.locationMode !== LocationMode.AT_PROVIDER,
        canManageAccess: false,
        // Handoff 17: only a VET-category visit produces clinical records —
        // a groomer/trainer/walker/sitter/boarding/taxi booking never grants
        // authority to author a ClinicalVisit/MedicalDocument/LabResult/etc.
        // Operational authority only: the vet may author new records for this visit window,
        // which does not by itself allow reading prior history.
        canRecordClinicalData: booking.category === ServiceCategory.VET,
        source: PetAccessSource.TEMPORARY,
        reason: healthConsented ? `${booking.category}_BOOKING_HEALTH_CONSENT` : `${booking.category}_BOOKING`,
        startsAt: new Date(),
        expiresAt: this.expiryFor(booking),
        grantedByUserId: booking.userId,
      },
    });
  }

  private publishGranted(booking: Booking, grantId: string, scopePreset: PetAccessScopePreset, tx: Prisma.TransactionClient) {
    return this.events.publish(
      "ServiceAccessGranted",
      { bookingId: booking.id, petId: booking.petId, grantId, scopePreset, category: booking.category },
      { tx, aggregateType: "PetAccessGrant", aggregateId: grantId },
    );
  }
}
