import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PetAccessSource, type Booking, type Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { HealthAccessScopePreset } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { AppEnv } from "../../config/env";

/**
 * What each preset actually exposes. HEALTH_BASICS matches the spec's
 * recommended default exactly. SELECTED_HEALTH_DATA is not yet distinct from
 * HEALTH_BASICS — there is no per-field health-data selection UI or API this
 * phase (HealthSummaryService returns one derived summary, not addressable
 * per-allergy/per-medication toggles) — see README Known limitations.
 * MINIMAL_VET_CONTEXT never includes health or care-profile access at all.
 */
const SCOPE_PRESET_FLAGS: Record<HealthAccessScopePreset, Omit<PetAccessFlags, "canManageAccess" | "canViewLocation" | "canEditIdentity" | "canBookCare">> = {
  [HealthAccessScopePreset.MINIMAL_VET_CONTEXT]: {
    canViewIdentity: true,
    canViewHealth: false,
    canEditHealth: false,
    canViewCareProfile: false,
    canEditCareProfile: false,
  },
  [HealthAccessScopePreset.HEALTH_BASICS]: {
    canViewIdentity: true,
    canViewHealth: true,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
  [HealthAccessScopePreset.SELECTED_HEALTH_DATA]: {
    canViewIdentity: true,
    canViewHealth: true,
    canEditHealth: false,
    canViewCareProfile: true,
    canEditCareProfile: false,
  },
};

@Injectable()
export class BookingHealthAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Creates an independent TEMPORARY PetAccessGrant for this booking's pet —
   * never touches or overwrites the household's own standing grant, per the
   * grant-union model (see the schema-hardening checkpoint). startsAt is the
   * moment of booking confirmation; expiresAt is the appointment's end time
   * plus a buffer (default 24h) for a same-day follow-up note.
   */
  async grantForBooking(
    booking: Booking,
    providerUserId: string | undefined,
    scopePreset: HealthAccessScopePreset,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!providerUserId) return; // No specific vet assigned yet — nothing to grant access to.

    const bufferHours = this.config.get("BOOKING_HEALTH_ACCESS_BUFFER_HOURS", { infer: true });
    const expiresAt = new Date(booking.endAt.getTime() + bufferHours * 60 * 60 * 1000);
    const flags = SCOPE_PRESET_FLAGS[scopePreset];

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
        canViewLocation: false,
        canManageAccess: false,
        source: PetAccessSource.TEMPORARY,
        reason: "VET_BOOKING",
        startsAt: new Date(),
        expiresAt,
        grantedByUserId: booking.userId,
      },
    });

    await tx.bookingHealthAccess.create({
      data: { bookingId: booking.id, petAccessGrantId: grant.id, scopePreset },
    });

    await this.events.publish(
      "TemporaryPetAccessGranted",
      { bookingId: booking.id, petId: booking.petId, grantId: grant.id, scopePreset },
      { tx, aggregateType: "PetAccessGrant", aggregateId: grant.id },
    );
  }

  /**
   * Revokes the grant this booking created, if any (a booking with no
   * assigned provider user never created one). Soft-revoke only — the row
   * (and BookingHealthAccess audit link) is preserved, per the same
   * revocation convention as every other PetAccessGrant.
   */
  async revokeForBooking(bookingId: string, revokedByUserId: string, tx: Prisma.TransactionClient): Promise<void> {
    const link = await tx.bookingHealthAccess.findUnique({ where: { bookingId } });
    if (!link) return;

    await tx.petAccessGrant.update({
      where: { id: link.petAccessGrantId },
      data: { revokedAt: new Date(), revokedByUserId },
    });

    await this.events.publish(
      "TemporaryPetAccessRevoked",
      { bookingId, grantId: link.petAccessGrantId },
      { tx, aggregateType: "PetAccessGrant", aggregateId: link.petAccessGrantId },
    );
  }
}
