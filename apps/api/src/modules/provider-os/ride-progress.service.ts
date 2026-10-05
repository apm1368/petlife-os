import { Injectable } from "@nestjs/common";
import { BookingStatus, LocationMode, Prisma, RideEventType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import type { ResolvedProviderContext } from "./auth/provider-context.types";

const ORDER: RideEventType[] = [RideEventType.DRIVER_ASSIGNED, RideEventType.ARRIVING, RideEventType.PICKED_UP, RideEventType.DROPPED_OFF];
const LIVE: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS];
/** The member hears about the moments that matter to them; DRIVER_ASSIGNED is internal bookkeeping. */
const NOTIFY: Partial<Record<RideEventType, string>> = { ARRIVING: "booking.ride_arriving", PICKED_UP: "booking.ride_picked_up", DROPPED_OFF: "booking.ride_dropped_off" };

/**
 * Pet-taxi progress the provider reports by hand — there is no GPS and nothing here pretends otherwise. Events
 * are append-only and strictly forward (a later stage can't be followed by an earlier one); each stage at most once.
 */
@Injectable()
export class RideProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  async get(ctx: ResolvedProviderContext, bookingId: string) {
    const b = await this.ride(ctx, bookingId);
    return {
      bookingId,
      pickupAddressText: b.transportRoute?.pickupAddressText ?? null,
      dropoffAddressText: b.transportRoute?.dropoffAddressText ?? null,
      requirements: b.transportRoute?.requirements ?? [],
      pickupContact: b.transportRoute?.pickupContactPhone ? { name: b.transportRoute.pickupContactName, phone: b.transportRoute.pickupContactPhone } : null,
      timeline: b.rideEvents.map((e) => ({ type: e.type, occurredAt: e.occurredAt.toISOString(), note: e.note })),
    };
  }

  async record(ctx: ResolvedProviderContext, bookingId: string, type: RideEventType, note?: string) {
    const b = await this.ride(ctx, bookingId);
    if (!LIVE.includes(b.bookingStatus)) throw new ValidationApiException({ field: "type", reason: "RIDE_NOT_ACTIVE", status: b.bookingStatus });
    const reached = Math.max(-1, ...b.rideEvents.map((e) => ORDER.indexOf(e.type)));
    if (ORDER.indexOf(type) <= reached) throw new ValidationApiException({ field: "type", reason: "RIDE_EVENT_OUT_OF_ORDER", reached: ORDER[reached] ?? null });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.bookingRideEvent.create({ data: { bookingId, type, actorProviderUserId: ctx.providerUserId, note: note?.trim() || null } });
        await this.events.publish("BookingRideEventRecorded", { bookingId, type, providerUserId: ctx.providerUserId }, { aggregateType: "Booking", aggregateId: bookingId, tx });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationApiException({ field: "type", reason: "RIDE_EVENT_ALREADY_RECORDED" });
      throw e;
    }
    const notifyType = NOTIFY[type];
    if (notifyType) {
      await this.notifications.notify({ userId: b.userId, type: notifyType, category: "BOOKING", petId: b.petId, householdId: b.householdId, deepLink: NotificationDeepLinks.booking(bookingId), entityType: "Booking", entityId: bookingId, templateParams: { provider: ctx.organizationName } });
    }
    return this.get(ctx, bookingId);
  }

  private async ride(ctx: ResolvedProviderContext, bookingId: string) {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, providerOrganizationId: ctx.organizationId }, include: { transportRoute: true, rideEvents: { orderBy: { occurredAt: "asc" } } } });
    if (!b) throw new NotFoundApiException("Booking");
    if (b.locationMode !== LocationMode.TRANSPORT) throw new ValidationApiException({ field: "bookingId", reason: "NOT_A_PET_TAXI_BOOKING" });
    return b;
  }
}
