import { Injectable } from "@nestjs/common";
import { BookingStatus, Prisma, type PetAccessGrant } from "@prisma/client";
import { SetupStatus as SharedSetupStatus, type CareProfileDto, type ProviderBookingDetailDto, type ProviderPetAccessContextDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import {
  BookingNotCancellableException,
  BookingNotFoundException,
  InvalidBookingTransitionException,
  ProviderAccessDeniedException,
  ProviderOrgNotVerifiedException,
} from "../../common/errors/api-exception";
import { isGrantActive } from "../pet-access/pet-access.service";
import { BookingPetAccessService } from "../booking/booking-pet-access.service";
import { CareCalendarService } from "../care-calendar/care-calendar.service";
import { CareProfileService } from "../care-profile/care-profile.service";
import { HealthSummaryService } from "../health/health-summary.service";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { toProviderBookingSummaryDto, type ProviderBookingRow } from "./provider-os-dto.mapper";
import type { ListProviderBookingsDto } from "./dto/list-provider-bookings.dto";
import type { CompleteBookingDto, ProviderCancelBookingDto, AddBookingProviderNoteDto } from "./dto/provider-booking-actions.dto";

const CANCELLABLE_STATUSES: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
const CANCELLED_STATUSES: BookingStatus[] = [BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_PROVIDER];

/** Strict single-step forward transitions (spec section 18) — no skipping, category never changes the state machine, only labels. */
const NEXT_STATUS: Partial<Record<BookingStatus, BookingStatus>> = {
  [BookingStatus.CONFIRMED]: BookingStatus.CHECKED_IN,
  [BookingStatus.CHECKED_IN]: BookingStatus.IN_PROGRESS,
  [BookingStatus.IN_PROGRESS]: BookingStatus.COMPLETED,
};

const BOOKING_ROW_INCLUDE = {
  pet: true,
  user: true,
  providerLocation: true,
  providerService: true,
} satisfies Prisma.BookingInclude;

function toIsoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

@Injectable()
export class ProviderBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly bookingPetAccess: BookingPetAccessService,
    private readonly careCalendar: CareCalendarService,
    private readonly careProfile: CareProfileService,
    private readonly healthSummary: HealthSummaryService,
  ) {}

  async list(ctx: ResolvedProviderContext, filter: ListProviderBookingsDto) {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const where: Prisma.BookingWhereInput = {
      providerOrganizationId: ctx.organizationId,
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.locationId ? { providerLocationId: filter.locationId } : {}),
      ...(filter.providerUserId ? { providerUserId: filter.providerUserId } : {}),
      ...(filter.cancelled === "true"
        ? { bookingStatus: { in: CANCELLED_STATUSES } }
        : filter.today === "true"
          ? { startAt: { gte: todayStart, lt: todayEnd }, bookingStatus: { notIn: CANCELLED_STATUSES } }
          : filter.upcoming === "true"
            ? { startAt: { gte: now }, bookingStatus: { notIn: CANCELLED_STATUSES } }
            : filter.past === "true"
              ? { startAt: { lt: now } }
              : {}),
    };

    const bookings = await this.prisma.booking.findMany({
      where,
      include: BOOKING_ROW_INCLUDE,
      orderBy: { startAt: filter.past === "true" || filter.cancelled === "true" ? "desc" : "asc" },
    });
    return bookings.map((b) => toProviderBookingSummaryDto(b as ProviderBookingRow));
  }

  private async loadForOrg(ctx: ResolvedProviderContext, id: string): Promise<ProviderBookingRow> {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include: BOOKING_ROW_INCLUDE });
    if (!booking) throw new BookingNotFoundException({ bookingId: id });
    if (booking.providerOrganizationId !== ctx.organizationId) {
      throw new ProviderAccessDeniedException({ reason: "CROSS_ORGANIZATION", bookingId: id });
    }
    return booking as ProviderBookingRow;
  }

  private assertVerified(ctx: ResolvedProviderContext): void {
    if (ctx.verificationStatus !== "VERIFIED") {
      throw new ProviderOrgNotVerifiedException({ verificationStatus: ctx.verificationStatus });
    }
  }

  private async resolvePetAccessContext(booking: ProviderBookingRow, ctx: ResolvedProviderContext): Promise<ProviderPetAccessContextDto> {
    const link = await this.prisma.bookingPetAccess.findUnique({
      where: { bookingId: booking.id },
      include: { petAccessGrant: true },
    });

    const noAccess: ProviderPetAccessContextDto = {
      state: "NO_GRANT",
      scopePreset: null,
      reason: null,
      startsAt: null,
      expiresAt: null,
      canViewCareProfile: false,
      canViewHealth: false,
    };
    if (!link) return noAccess;

    const grant: PetAccessGrant = link.petAccessGrant;
    // The grant is only "this provider user's own" access — a receptionist viewing a
    // booking assigned to the vet has no access via that vet's grant (spec section 4:
    // provider role is never a pet-data permission source; PetAccessGrant is per-person).
    if (grant.userId !== ctx.userId) return noAccess;

    const base = {
      scopePreset: link.scopePreset as unknown as ProviderPetAccessContextDto["scopePreset"],
      reason: grant.reason,
      startsAt: toIsoOrNull(grant.startsAt),
      expiresAt: toIsoOrNull(grant.expiresAt),
      canViewCareProfile: grant.canViewCareProfile,
      canViewHealth: grant.canViewHealth,
    };

    if (grant.revokedAt) return { ...base, state: "REVOKED", canViewCareProfile: false, canViewHealth: false };
    if (!isGrantActive(grant, new Date())) return { ...base, state: "EXPIRED", canViewCareProfile: false, canViewHealth: false };
    return { ...base, state: "GRANTED" };
  }

  async getById(ctx: ResolvedProviderContext, id: string): Promise<ProviderBookingDetailDto> {
    const booking = await this.loadForOrg(ctx, id);
    const access = await this.resolvePetAccessContext(booking, ctx);

    const [careProfile, healthSummaryDto] = await Promise.all([
      access.canViewCareProfile ? this.careProfile.get(booking.petId) : Promise.resolve(null),
      access.canViewHealth ? this.healthSummary.getSummary(booking.petId) : Promise.resolve(null),
    ]);

    const providerNoteRows = await this.prisma.bookingProviderNote.findMany({ where: { bookingId: id }, orderBy: { createdAt: "desc" } });

    return {
      booking: {
        ...toProviderBookingSummaryDto(booking),
        reasonForVisit: booking.reasonForVisit,
        ownerNotes: booking.ownerNotes,
        cancelledAt: toIsoOrNull(booking.cancelledAt),
        cancelledReason: booking.cancelledReason,
        completedAt: toIsoOrNull(booking.completedAt),
        completedByProviderUserId: booking.completedByProviderUserId,
        completionNote: booking.completionNote,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString(),
      },
      pet: { id: booking.pet.id, name: booking.pet.name, species: booking.pet.species as unknown as ProviderBookingDetailDto["pet"]["species"], breed: booking.pet.breed, photoUrl: booking.pet.photoUrl },
      access,
      careProfile: careProfile ? toCareProfileDto(careProfile) : null,
      healthSummary: healthSummaryDto,
      providerNotes: providerNoteRows.map((n) => ({
        id: n.id,
        bookingId: n.bookingId,
        providerUserId: n.providerUserId,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * Idempotent no-op only valid from an already-CONFIRMED booking — this
   * architecture never persists a genuine HOLD/PENDING_CONFIRMATION row to
   * confirm (see the doc comment on BookingStatus), so "confirm" exists for
   * spec completeness and to produce an auditable ProviderBookingConfirmed
   * event, not to perform a real state change.
   */
  async confirm(ctx: ResolvedProviderContext, id: string): Promise<ProviderBookingDetailDto> {
    this.assertVerified(ctx);
    const booking = await this.loadForOrg(ctx, id);
    if (booking.bookingStatus !== BookingStatus.CONFIRMED) {
      throw new InvalidBookingTransitionException({ from: booking.bookingStatus, to: "CONFIRMED" });
    }
    await this.events.publish(
      "ProviderBookingConfirmed",
      { bookingId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "Booking", aggregateId: id },
    );
    return this.getById(ctx, id);
  }

  async cancel(ctx: ResolvedProviderContext, id: string, dto: ProviderCancelBookingDto): Promise<ProviderBookingDetailDto> {
    const booking = await this.loadForOrg(ctx, id);
    if (!CANCELLABLE_STATUSES.includes(booking.bookingStatus)) {
      throw new BookingNotCancellableException({ bookingId: id, status: booking.bookingStatus });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: { bookingStatus: BookingStatus.CANCELLED_BY_PROVIDER, cancelledAt: new Date(), cancelledReason: dto.reason },
      });
      await this.bookingPetAccess.revokeForBooking(id, ctx.userId, tx);
      await this.careCalendar.markCancelled(id, tx);
      await this.events.publish(
        "ProviderBookingCancelled",
        { bookingId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId, reason: dto.reason },
        { tx, aggregateType: "Booking", aggregateId: id },
      );
    });

    return this.getById(ctx, id);
  }

  private async transition(
    ctx: ResolvedProviderContext,
    id: string,
    expectedNext: BookingStatus,
    eventType: "BookingCheckedIn" | "BookingStarted" | "BookingCompleted",
    extraData: Prisma.BookingUpdateInput = {},
  ): Promise<ProviderBookingDetailDto> {
    this.assertVerified(ctx);
    const booking = await this.loadForOrg(ctx, id);
    if (NEXT_STATUS[booking.bookingStatus] !== expectedNext) {
      throw new InvalidBookingTransitionException({ from: booking.bookingStatus, to: expectedNext });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { bookingStatus: expectedNext, ...extraData } });
      if (expectedNext === BookingStatus.COMPLETED) {
        await this.careCalendar.markCompleted(id, tx);
      }
      await this.events.publish(
        eventType,
        { bookingId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
        { tx, aggregateType: "Booking", aggregateId: id },
      );
    });

    return this.getById(ctx, id);
  }

  checkIn(ctx: ResolvedProviderContext, id: string) {
    return this.transition(ctx, id, BookingStatus.CHECKED_IN, "BookingCheckedIn");
  }

  start(ctx: ResolvedProviderContext, id: string) {
    return this.transition(ctx, id, BookingStatus.IN_PROGRESS, "BookingStarted");
  }

  complete(ctx: ResolvedProviderContext, id: string, dto: CompleteBookingDto) {
    return this.transition(ctx, id, BookingStatus.COMPLETED, "BookingCompleted", {
      completedAt: new Date(),
      completedByProviderUserId: ctx.providerUserId,
      completionNote: dto.completionNote ?? null,
    });
  }

  async addNote(ctx: ResolvedProviderContext, id: string, dto: AddBookingProviderNoteDto) {
    await this.loadForOrg(ctx, id);
    const note = await this.prisma.bookingProviderNote.create({
      data: { bookingId: id, providerUserId: ctx.providerUserId, content: dto.content },
    });
    return {
      id: note.id,
      bookingId: note.bookingId,
      providerUserId: note.providerUserId,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}

/** CareProfileService.get() returns a raw Prisma row, or (when no profile exists yet) a synthetic NOT_STARTED shape with no text fields at all — normalize both to the DTO's shape. */
function toCareProfileDto(profile: Awaited<ReturnType<CareProfileService["get"]>>): CareProfileDto {
  const textFields = "temperamentText" in profile ? profile : null;
  return {
    petId: profile.petId,
    temperamentText: textFields?.temperamentText ?? null,
    aroundPeopleText: textFields?.aroundPeopleText ?? null,
    aroundAnimalsText: textFields?.aroundAnimalsText ?? null,
    leashBehaviorText: textFields?.leashBehaviorText ?? null,
    handlingSensitivityText: textFields?.handlingSensitivityText ?? null,
    feedingRoutineText: textFields?.feedingRoutineText ?? null,
    toiletRoutineText: textFields?.toiletRoutineText ?? null,
    separationBehaviorText: textFields?.separationBehaviorText ?? null,
    specialInstructionsText: textFields?.specialInstructionsText ?? null,
    status: profile.status as unknown as SharedSetupStatus,
    createdAt: profile.createdAt ? profile.createdAt.toISOString() : "",
    updatedAt: profile.updatedAt ? profile.updatedAt.toISOString() : "",
  };
}
