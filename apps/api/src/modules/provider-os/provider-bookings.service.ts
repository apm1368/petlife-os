import { Injectable } from "@nestjs/common";
import { BookingActorType, BookingPaymentMode, BookingStatus, PaymentStatus, Prisma, SourceType, type PetAccessGrant } from "@prisma/client";
import { SetupStatus as SharedSetupStatus, type CareProfileDto, type ProviderBookingDetailDto, type ProviderPetAccessContextDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import {
  BookingNotCancellableException,
  BookingNotFoundException,
  InvalidBookingTransitionException,
  ProviderAccessDeniedException,
  ProviderOrgNotVerifiedException,
  ValidationApiException,
} from "../../common/errors/api-exception";
import { isGrantActive } from "../pet-access/pet-access.service";
import { BookingPetAccessService } from "../booking/booking-pet-access.service";
import { BookingLifecycleService, bookingEventFields } from "../booking/booking-lifecycle.service";
import { CareCalendarService } from "../care-calendar/care-calendar.service";
import { CareProfileService } from "../care-profile/care-profile.service";
import { HealthSummaryService } from "../health/health-summary.service";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { toProviderBookingSummaryDto, type ProviderBookingRow } from "./provider-os-dto.mapper";
import type { ListProviderBookingsDto } from "./dto/list-provider-bookings.dto";
import type { CompleteBookingDto, ProviderCancelBookingDto, AddBookingProviderNoteDto } from "./dto/provider-booking-actions.dto";

const CANCELLABLE_STATUSES: BookingStatus[] = [BookingStatus.PENDING_CONFIRMATION, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
const CANCELLED_STATUSES: BookingStatus[] = [BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_PROVIDER, BookingStatus.REJECTED, BookingStatus.EXPIRED, BookingStatus.RESCHEDULED];

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
    private readonly lifecycle: BookingLifecycleService,
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
      ...(filter.from || filter.to ? { startAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lt: new Date(filter.to) } : {}) } } : {}),
      ...(filter.requests === "true"
        ? { bookingStatus: BookingStatus.REQUESTED }
        : filter.cancelled === "true"
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
      take: 500,
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
      const cancelled = await this.lifecycle.transition(tx, {
        bookingId: id,
        to: BookingStatus.CANCELLED_BY_PROVIDER,
        actorType: BookingActorType.PROVIDER,
        actorId: ctx.userId,
        reason: dto.reason,
        data: { cancelledAt: new Date(), cancelledReason: dto.reason },
      });
      // A provider-side cancellation always refunds whatever the customer paid.
      await this.lifecycle.requestRefund(tx, cancelled, true, ctx.userId);
      await this.events.publish(
        "ProviderBookingCancelled",
        { bookingId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId, reason: dto.reason },
        { tx, aggregateType: "Booking", aggregateId: id },
      );
      await this.events.publish("ServiceBookingCancelled", { ...bookingEventFields(cancelled), reason: dto.reason, cancelledBy: "PROVIDER" }, { tx, aggregateType: "Booking", aggregateId: id });
    });

    return this.getById(ctx, id);
  }

  /**
   * Request-to-book acceptance. A paid service moves to AWAITING_PAYMENT with a fresh payment window;
   * otherwise it is confirmed immediately. Acceptance can never skip payment.
   */
  async accept(ctx: ResolvedProviderContext, id: string): Promise<ProviderBookingDetailDto> {
    this.assertVerified(ctx);
    const booking = await this.loadForOrg(ctx, id);
    if (booking.bookingStatus !== BookingStatus.REQUESTED) {
      throw new InvalidBookingTransitionException({ from: booking.bookingStatus, to: "ACCEPTED" });
    }
    const paid = booking.paymentMode === BookingPaymentMode.FULL_PREPAYMENT || booking.paymentMode === BookingPaymentMode.DEPOSIT;
    await this.prisma.$transaction(async (tx) => {
      const next = await this.lifecycle.transition(tx, {
        bookingId: id,
        to: paid ? BookingStatus.AWAITING_PAYMENT : BookingStatus.CONFIRMED,
        from: [BookingStatus.REQUESTED],
        actorType: BookingActorType.PROVIDER,
        actorId: ctx.userId,
        reason: "ACCEPTED",
        data: { respondedAt: new Date(), requestExpiresAt: paid ? new Date(Date.now() + 24 * 3600_000) : null, paymentStatus: paid ? PaymentStatus.PENDING : booking.paymentStatus },
      });
      await this.careCalendar.upsertForBooking(next, tx);
      await this.events.publish("ServiceBookingAccepted", { ...bookingEventFields(next), awaitingPayment: paid }, { tx, aggregateType: "Booking", aggregateId: id });
      if (!paid) await this.events.publish("ServiceBookingConfirmed", bookingEventFields(next), { tx, aggregateType: "Booking", aggregateId: id });
    });
    return this.getById(ctx, id);
  }

  async reject(ctx: ResolvedProviderContext, id: string, reason: string): Promise<ProviderBookingDetailDto> {
    this.assertVerified(ctx);
    const booking = await this.loadForOrg(ctx, id);
    if (booking.bookingStatus !== BookingStatus.REQUESTED) {
      throw new InvalidBookingTransitionException({ from: booking.bookingStatus, to: BookingStatus.REJECTED });
    }
    await this.prisma.$transaction(async (tx) => {
      const rejected = await this.lifecycle.transition(tx, {
        bookingId: id,
        to: BookingStatus.REJECTED,
        from: [BookingStatus.REQUESTED],
        actorType: BookingActorType.PROVIDER,
        actorId: ctx.userId,
        reason,
        data: { respondedAt: new Date(), rejectedReason: reason, requestExpiresAt: null },
      });
      await this.events.publish("ServiceBookingRejected", bookingEventFields(rejected), { tx, aggregateType: "Booking", aggregateId: id });
    });
    return this.getById(ctx, id);
  }

  /** Only after the appointment start; never refunds automatically (policy decides through support/finance). */
  async markNoShow(ctx: ResolvedProviderContext, id: string): Promise<ProviderBookingDetailDto> {
    this.assertVerified(ctx);
    const booking = await this.loadForOrg(ctx, id);
    if (booking.bookingStatus !== BookingStatus.CONFIRMED || booking.startAt > new Date()) {
      throw new InvalidBookingTransitionException({ from: booking.bookingStatus, to: BookingStatus.NO_SHOW });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.transition(tx, { bookingId: id, to: BookingStatus.NO_SHOW, from: [BookingStatus.CONFIRMED], actorType: BookingActorType.PROVIDER, actorId: ctx.userId });
      await this.bookingPetAccess.revokeForBooking(id, ctx.userId, tx);
      await this.careCalendar.markCancelled(id, tx);
      await this.events.publish("ServiceBookingNoShow", { bookingId: id, providerOrganizationId: ctx.organizationId }, { tx, aggregateType: "Booking", aggregateId: id });
    });
    return this.getById(ctx, id);
  }

  private async transition(
    ctx: ResolvedProviderContext,
    id: string,
    expectedNext: BookingStatus,
    eventType: "BookingCheckedIn" | "BookingStarted" | "BookingCompleted",
    extraData: Prisma.BookingUncheckedUpdateManyInput = {},
  ): Promise<ProviderBookingDetailDto> {
    this.assertVerified(ctx);
    const booking = await this.loadForOrg(ctx, id);
    if (NEXT_STATUS[booking.bookingStatus] !== expectedNext) {
      throw new InvalidBookingTransitionException({ from: booking.bookingStatus, to: expectedNext });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lifecycle.transition(tx, {
        bookingId: id,
        to: expectedNext,
        from: [booking.bookingStatus],
        actorType: BookingActorType.PROVIDER,
        actorId: ctx.userId,
        data: extraData,
      });
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

  async complete(ctx: ResolvedProviderContext, id: string, dto: CompleteBookingDto) {
    if (dto.followUps?.length) {
      const booking = await this.loadForOrg(ctx, id);
      if (booking.category !== "VET") throw new ValidationApiException({ field: "followUps", reason: "Clinical follow-ups belong to veterinary bookings only" });
      const now = Date.now();
      if (dto.followUps.some((f) => new Date(f.dueAt).getTime() <= now)) throw new ValidationApiException({ field: "followUps.dueAt", reason: "Follow-ups must be in the future" });
    }
    const result = await this.transition(ctx, id, BookingStatus.COMPLETED, "BookingCompleted", {
      completedAt: new Date(),
      completedByProviderUserId: ctx.providerUserId,
      completionNote: dto.completionNote ?? null,
    });
    if (dto.followUps?.length) await this.createFollowUpPlan(ctx, id, dto);
    return result;
  }

  /**
   * Provider-specified follow-up → CarePlan (linked to the booking's clinical visit when one exists) →
   * CarePlanCreated → the Care Center projects it as PROVIDER_CREATED. Reuses the Batch 2 contract;
   * it never writes CareReminder rows directly and never invents a schedule.
   */
  private async createFollowUpPlan(ctx: ResolvedProviderContext, bookingId: string, dto: CompleteBookingDto): Promise<void> {
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { petId: true, serviceNameSnapshot: true, clinicalVisits: { select: { id: true }, take: 1, orderBy: { startedAt: "desc" } } } });
    await this.prisma.$transaction(async (tx) => {
      const plan = await tx.carePlan.create({
        data: {
          petId: booking.petId,
          providerOrganizationId: ctx.organizationId,
          providerUserId: ctx.providerUserId,
          originatingVisitId: booking.clinicalVisits[0]?.id ?? null,
          title: booking.serviceNameSnapshot ?? "Follow-up",
          items: { create: dto.followUps!.map((f) => ({ type: f.type, title: f.title, detail: f.detail, dueAt: new Date(f.dueAt), source: SourceType.PROVIDER })) },
        },
      });
      await this.events.publish("CarePlanCreated", { petId: booking.petId, carePlanId: plan.id }, { tx, aggregateType: "Pet", aggregateId: booking.petId });
      await this.events.publish("BookingFollowUpCreated", { bookingId, carePlanId: plan.id, count: dto.followUps!.length }, { tx, aggregateType: "Booking", aggregateId: bookingId });
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
