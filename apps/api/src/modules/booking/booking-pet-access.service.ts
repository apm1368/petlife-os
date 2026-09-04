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

/** The default preset per category when a booking doesn't explicitly choose one (never "full record" by default). */
export const DEFAULT_SCOPE_PRESET_BY_CATEGORY: Record<ServiceCategory, PetAccessScopePreset> = {
  [ServiceCategory.VET]: PetAccessScopePreset.HEALTH_BASICS,
  [ServiceCategory.GROOMING]: PetAccessScopePreset.GROOMING_BASIC,
  [ServiceCategory.TRAINING]: PetAccessScopePreset.TRAINING_BASIC,
  [ServiceCategory.WALKING]: PetAccessScopePreset.WALKING_BASIC,
  [ServiceCategory.SITTING]: PetAccessScopePreset.SITTING_BASIC,
  [ServiceCategory.BOARDING]: PetAccessScopePreset.BOARDING_BASIC,
  [ServiceCategory.PET_TAXI]: PetAccessScopePreset.TAXI_BASIC,
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
   * Creates an independent TEMPORARY PetAccessGrant for this booking's pet —
   * never touches or overwrites the household's own standing grant, per the
   * grant-union model (see the schema-hardening checkpoint). startsAt is the
   * moment of booking confirmation; expiresAt is the booking's end time plus
   * a buffer (default 24h, same rule for a 30-minute vet visit and a
   * multi-day Boarding stay — see README "Access expiry").
   */
  async grantForBooking(
    booking: Booking,
    providerUserId: string | undefined,
    scopePreset: PetAccessScopePreset,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!providerUserId) return; // No specific provider staff assigned yet — nothing to grant access to.

    const bufferHours = this.config.get("BOOKING_HEALTH_ACCESS_BUFFER_HOURS", { infer: true });
    const expiresAt = new Date(booking.endAt.getTime() + bufferHours * 60 * 60 * 1000);
    const flags = SCOPE_PRESET_FLAGS[scopePreset];
    const canViewLocation = booking.locationMode !== LocationMode.AT_PROVIDER;

    const providerUser = await tx.providerUser.findUnique({ where: { id: providerUserId } });
    if (!providerUser) return;

    const grant = await tx.petAccessGrant.create({
      data: {
        petId: booking.petId,
        userId: providerUser.userId,
        canViewIdentity: flags.canViewIdentity,
        canEditIdentity: false,
        canViewHealth: flags.canViewHealth,
        canEditHealth: flags.canEditHealth,
        canBookCare: false,
        canViewCareProfile: flags.canViewCareProfile,
        canEditCareProfile: flags.canEditCareProfile,
        canViewLocation,
        canManageAccess: false,
        // Handoff 17: only a VET-category visit produces clinical records —
        // a groomer/trainer/walker/sitter/boarding/taxi booking never grants
        // authority to author a ClinicalVisit/MedicalDocument/LabResult/etc.
        canRecordClinicalData: booking.category === ServiceCategory.VET,
        source: PetAccessSource.TEMPORARY,
        reason: `${booking.category}_BOOKING`,
        startsAt: new Date(),
        expiresAt,
        grantedByUserId: booking.userId,
      },
    });

    await tx.bookingPetAccess.create({
      data: { bookingId: booking.id, petAccessGrantId: grant.id, scopePreset },
    });

    await this.events.publish(
      "ServiceAccessGranted",
      { bookingId: booking.id, petId: booking.petId, grantId: grant.id, scopePreset, category: booking.category },
      { tx, aggregateType: "PetAccessGrant", aggregateId: grant.id },
    );
  }

  /**
   * Revokes the grant this booking created, if any (a booking with no
   * assigned provider user never created one). Soft-revoke only — the row
   * (and BookingPetAccess audit link) is preserved, per the same revocation
   * convention as every other PetAccessGrant.
   */
  async revokeForBooking(bookingId: string, revokedByUserId: string, tx: Prisma.TransactionClient): Promise<void> {
    const link = await tx.bookingPetAccess.findUnique({ where: { bookingId } });
    if (!link) return;

    await tx.petAccessGrant.update({
      where: { id: link.petAccessGrantId },
      data: { revokedAt: new Date(), revokedByUserId },
    });

    await this.events.publish(
      "ServiceAccessRevoked",
      { bookingId, grantId: link.petAccessGrantId },
      { tx, aggregateType: "PetAccessGrant", aggregateId: link.petAccessGrantId },
    );
  }
}
