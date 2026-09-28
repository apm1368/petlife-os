import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";

interface TravelEventPayload {
  bookingId: string;
  reference: string;
  listingTitle: string;
  organizationId: string;
  userId: string;
  cancelledBy?: string;
  note?: string | null;
  listingId?: string;
  to?: string;
}

/**
 * Travel booking notifications through H10. Payload-only for the booking
 * facts (events publish before commit). Provider-side alerts go to every
 * OWNER of the organization; traveller alerts go to the booking's owner.
 * Each one deep-links to the exact booking.
 */
@Injectable()
export class TravelNotificationListener {
  private readonly logger = new Logger(TravelNotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: NotificationOrchestratorService,
  ) {}

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Travel notification failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  private async traveler(p: TravelEventPayload, type: string, domainEventId: string, priority?: NotificationPriority): Promise<void> {
    await this.orchestrator.notify({
      userId: p.userId,
      type,
      category: NotificationCategory.TRAVEL,
      ...(priority ? { priority } : {}),
      deepLink: NotificationDeepLinks.travelBooking(p.bookingId),
      entityType: "TravelBooking",
      entityId: p.bookingId,
      domainEventId,
    });
  }

  private async provider(p: TravelEventPayload, type: string, domainEventId: string) {
    const owners = await this.prisma.providerUser.findMany({ where: { providerOrganizationId: p.organizationId, role: "OWNER" }, select: { userId: true } });
    for (const owner of owners) {
      await this.orchestrator.notify({
        userId: owner.userId,
        type,
        category: NotificationCategory.TRAVEL,
        deepLink: NotificationDeepLinks.providerTravelBooking(p.bookingId),
        entityType: "TravelBooking",
        entityId: p.bookingId,
        domainEventId,
      });
    }
  }

  @OnEvent("TravelBookingRequested")
  onRequested(p: TravelEventPayload, id: string) {
    return this.safely("TravelBookingRequested", async () => {
      await this.provider(p, "travel.booking_request_received", id);
      await this.traveler(p, "travel.booking_requested", id);
    });
  }

  @OnEvent("TravelBookingPaymentRequired")
  onPaymentRequired(p: TravelEventPayload, id: string) {
    return this.safely("TravelBookingPaymentRequired", () => this.traveler(p, "travel.payment_required", id, NotificationPriority.HIGH));
  }

  @OnEvent("TravelBookingConfirmed")
  onConfirmed(p: TravelEventPayload, id: string) {
    return this.safely("TravelBookingConfirmed", async () => {
      await this.traveler(p, "travel.booking_confirmed", id);
      await this.provider(p, "travel.booking_confirmed_provider", id);
    });
  }

  @OnEvent("TravelBookingRejected")
  onRejected(p: TravelEventPayload, id: string) {
    return this.safely("TravelBookingRejected", () => this.traveler(p, "travel.booking_rejected", id));
  }

  @OnEvent("TravelBookingExpired")
  onExpired(p: TravelEventPayload, id: string) {
    return this.safely("TravelBookingExpired", () => this.traveler(p, "travel.booking_expired", id));
  }

  @OnEvent("TravelBookingCancelled")
  onCancelled(p: TravelEventPayload, id: string) {
    return this.safely("TravelBookingCancelled", async () => {
      if (p.cancelledBy === "PROVIDER") await this.traveler(p, "travel.booking_cancelled_by_provider", id, NotificationPriority.HIGH);
      else await this.provider(p, "travel.booking_cancelled_by_traveler", id);
    });
  }

  @OnEvent("TravelBookingChanged")
  onChanged(p: TravelEventPayload, id: string) {
    return this.safely("TravelBookingChanged", () => this.provider(p, "travel.booking_changed", id));
  }

  @OnEvent("TravelListingStatusChanged")
  onListingStatus(p: { listingId: string; organizationId?: string; to: string }, id: string) {
    return this.safely("TravelListingStatusChanged", async () => {
      if (!p.organizationId || !["PUBLISHED", "DRAFT", "SUSPENDED"].includes(p.to)) return;
      const owners = await this.prisma.providerUser.findMany({ where: { providerOrganizationId: p.organizationId, role: "OWNER" }, select: { userId: true } });
      for (const owner of owners) {
        await this.orchestrator.notify({
          userId: owner.userId,
          type: `travel.listing_${p.to.toLowerCase()}`,
          category: NotificationCategory.TRAVEL,
          deepLink: NotificationDeepLinks.providerTravelListing(p.listingId),
          entityType: "TravelListing",
          entityId: p.listingId,
          domainEventId: id,
        });
      }
    });
  }
}
