import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { WaitlistStatus, type BookingWaitlistEntry } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import type { JoinWaitlistDto } from "./dto/waitlist.dto";
import { SlotGeneratorService } from "../providers/slot-generator.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { BookingsService } from "./bookings.service";
import type { BookingHoldDto } from "@petlife/types";

const MAX_WINDOW_DAYS = 30;
const MAX_ACTIVE_ENTRIES_PER_USER = 10;

export interface WaitlistEntryDto {
  id: string;
  petId: string;
  petName: string;
  providerOrganizationId: string;
  providerName: string;
  serviceId: string;
  serviceName: string;
  variantId: string | null;
  windowStart: string;
  windowEnd: string;
  status: WaitlistStatus;
  notifiedAt: string | null;
  /** A concrete slot the provider offered (status OFFERED); accept before expiresAt to get a normal booking hold. */
  offer: { startAt: string; expiresAt: string; providerUserId: string | null } | null;
  createdAt: string;
}

type EntryRow = BookingWaitlistEntry & { pet: { name: string }; providerOrganization: { name: string }; service: { name: string } };

function toDto(row: EntryRow): WaitlistEntryDto {
  return {
    id: row.id,
    petId: row.petId,
    petName: row.pet.name,
    providerOrganizationId: row.providerOrganizationId,
    providerName: row.providerOrganization.name,
    serviceId: row.serviceId,
    serviceName: row.service.name,
    variantId: row.variantId,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    status: row.status,
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    offer: row.status === WaitlistStatus.OFFERED && row.offerStartAt && row.offerExpiresAt ? { startAt: row.offerStartAt.toISOString(), expiresAt: row.offerExpiresAt.toISOString(), providerUserId: row.offerProviderUserId } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const INCLUDE = { pet: { select: { name: true } }, providerOrganization: { select: { name: true } }, service: { select: { name: true } } } as const;

/**
 * Waitlist V1: strictly first-come among entries whose window covers the released time. When
 * capacity opens, only the earliest eligible entry is notified; nobody is auto-booked or charged,
 * and the customer still books through the normal hold → confirm flow.
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly slots: SlotGeneratorService,
    private readonly bookings: BookingsService,
    private readonly petAccess: PetAccessService,
  ) {}

  /** Lapsed offers become EXPIRED (lazily, on every read/act — no hidden booking is ever kept). */
  private async expireOffers(where: { userId?: string; providerOrganizationId?: string; id?: string }) {
    await this.prisma.bookingWaitlistEntry.updateMany({ where: { ...where, status: WaitlistStatus.OFFERED, offerExpiresAt: { lte: new Date() } }, data: { status: WaitlistStatus.EXPIRED } });
  }

  /**
   * G13: the provider offers one concrete, currently AVAILABLE slot inside the member's window. Nothing is booked or
   * held yet — the offer expires (15 min – 24 h, default 2 h) and accepting it goes through the normal hold flow,
   * which re-validates availability, so two offers for one slot can never both turn into bookings.
   */
  async offer(providerOrganizationId: string, actorUserId: string, entryId: string, dto: { startAt: string; providerUserId?: string; expiresInMinutes?: number }): Promise<WaitlistEntryDto> {
    await this.expireOffers({ id: entryId });
    const entry = await this.prisma.bookingWaitlistEntry.findFirst({ where: { id: entryId, providerOrganizationId }, include: { service: true } });
    if (!entry) throw new NotFoundApiException("Waitlist entry");
    if (entry.status !== WaitlistStatus.ACTIVE && entry.status !== WaitlistStatus.NOTIFIED) throw new ValidationApiException({ field: "entryId", reason: "NOT_OPEN", status: entry.status });
    const startAt = new Date(dto.startAt);
    const duration = (entry.variantId ? (await this.prisma.providerServiceVariant.findUnique({ where: { id: entry.variantId } }))?.durationMinutes : null) ?? entry.service.durationMinutes;
    const endAt = new Date(startAt.getTime() + duration * 60_000);
    if (startAt <= new Date() || startAt < entry.windowStart || endAt > entry.windowEnd) throw new ValidationApiException({ field: "startAt", reason: "OUTSIDE_MEMBER_WINDOW" });
    const locationId = entry.service.locationId ?? (await this.prisma.providerLocation.findFirst({ where: { providerOrganizationId }, select: { id: true } }))?.id;
    if (!locationId) throw new ValidationApiException({ field: "locationId", reason: "NO_LOCATION" });
    const free = await this.slots.generate({ providerOrganizationId, locationId, serviceId: entry.serviceId, providerUserId: dto.providerUserId, variantId: entry.variantId ?? undefined, from: new Date(startAt.getTime() - 60_000), to: new Date(endAt.getTime() + 60_000) });
    const match = free.find((slot) => slot.startAt.getTime() === startAt.getTime() && slot.state === "AVAILABLE");
    if (!match) throw new ValidationApiException({ field: "startAt", reason: "SLOT_NOT_AVAILABLE" });
    const minutes = Math.min(Math.max(dto.expiresInMinutes ?? 120, 15), 1440);
    const offerExpiresAt = new Date(Math.min(Date.now() + minutes * 60_000, startAt.getTime()));
    const claimed = await this.prisma.bookingWaitlistEntry.updateMany({
      where: { id: entryId, status: { in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED] } },
      data: { status: WaitlistStatus.OFFERED, offerStartAt: startAt, offerProviderUserId: dto.providerUserId ?? match.providerUserId ?? null, offerExpiresAt, offeredByUserId: actorUserId },
    });
    if (claimed.count !== 1) throw new ValidationApiException({ field: "entryId", reason: "NOT_OPEN" });
    await this.events.publish("WaitlistOfferMade", { entryId, userId: entry.userId, providerOrganizationId, serviceId: entry.serviceId, startAt: startAt.toISOString(), expiresAt: offerExpiresAt.toISOString() }, { aggregateType: "BookingWaitlistEntry", aggregateId: entryId });
    return toDto(await this.prisma.bookingWaitlistEntry.findUniqueOrThrow({ where: { id: entryId }, include: INCLUDE }));
  }

  /** The member takes the offer: a normal booking hold (availability re-checked); the entry is BOOKED on confirmation. */
  async acceptOffer(userId: string, entryId: string): Promise<{ entry: WaitlistEntryDto; hold: BookingHoldDto }> {
    await this.expireOffers({ id: entryId });
    const entry = await this.prisma.bookingWaitlistEntry.findUnique({ where: { id: entryId }, include: { service: true } });
    if (!entry || entry.userId !== userId) throw new NotFoundApiException("Waitlist entry");
    if (entry.status === WaitlistStatus.EXPIRED) throw new ValidationApiException({ field: "entryId", reason: "OFFER_EXPIRED" });
    if (entry.status !== WaitlistStatus.OFFERED || !entry.offerStartAt) throw new ValidationApiException({ field: "entryId", reason: "NO_OPEN_OFFER", status: entry.status });
    const access = await this.petAccess.getEffectivePermissions(entry.petId, userId);
    if (!access?.canBookCare) throw new PetAccessDeniedException({ petId: entry.petId });
    const locationId = entry.service.locationId ?? (await this.prisma.providerLocation.findFirstOrThrow({ where: { providerOrganizationId: entry.providerOrganizationId }, select: { id: true } })).id;
    const hold = await this.bookings.createHold(userId, { petId: entry.petId, providerId: entry.providerOrganizationId, locationId, serviceId: entry.serviceId, slotStart: entry.offerStartAt.toISOString(), providerUserId: entry.offerProviderUserId ?? undefined, variantId: entry.variantId ?? undefined });
    return { entry: toDto(await this.prisma.bookingWaitlistEntry.findUniqueOrThrow({ where: { id: entryId }, include: INCLUDE })), hold };
  }

  /** Decline: back in the queue, offer cleared. */
  async declineOffer(userId: string, entryId: string): Promise<WaitlistEntryDto> {
    const done = await this.prisma.bookingWaitlistEntry.updateMany({ where: { id: entryId, userId, status: WaitlistStatus.OFFERED }, data: { status: WaitlistStatus.ACTIVE, offerStartAt: null, offerExpiresAt: null, offerProviderUserId: null, offeredByUserId: null } });
    if (!done.count) throw new NotFoundApiException("Waitlist offer");
    return toDto(await this.prisma.bookingWaitlistEntry.findUniqueOrThrow({ where: { id: entryId }, include: INCLUDE }));
  }

  async join(userId: string, dto: JoinWaitlistDto): Promise<WaitlistEntryDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id: dto.petId } });
    if (!pet) throw new NotFoundApiException("Pet");
    const service = await this.prisma.providerService.findUnique({ where: { id: dto.serviceId }, include: { variants: true } });
    if (!service || service.providerOrganizationId !== dto.providerId || !service.isActive) throw new NotFoundApiException("Service");
    if (dto.variantId && !service.variants.some((v) => v.id === dto.variantId && v.isActive)) throw new NotFoundApiException("Service variant");
    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);
    if (windowEnd <= windowStart || windowEnd <= new Date() || windowEnd.getTime() - windowStart.getTime() > MAX_WINDOW_DAYS * 86400_000) {
      throw new ValidationApiException({ field: "windowEnd", reason: `Choose a future window of at most ${MAX_WINDOW_DAYS} days` });
    }
    const active = await this.prisma.bookingWaitlistEntry.count({ where: { userId, status: { in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED] } } });
    if (active >= MAX_ACTIVE_ENTRIES_PER_USER) throw new ValidationApiException({ reason: `At most ${MAX_ACTIVE_ENTRIES_PER_USER} active waitlist entries` });

    const row = await this.prisma.bookingWaitlistEntry.create({
      data: { householdId: pet.householdId, userId, petId: pet.id, providerOrganizationId: dto.providerId, serviceId: dto.serviceId, variantId: dto.variantId ?? null, windowStart, windowEnd },
      include: INCLUDE,
    });
    await this.events.publish("WaitlistJoined", { entryId: row.id, providerOrganizationId: dto.providerId, serviceId: dto.serviceId }, { aggregateType: "BookingWaitlistEntry", aggregateId: row.id });
    return toDto(row);
  }

  async listMine(userId: string): Promise<WaitlistEntryDto[]> {
    await this.expireOffers({ userId });
    const rows = await this.prisma.bookingWaitlistEntry.findMany({ where: { userId }, include: INCLUDE, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map(toDto);
  }

  async cancel(userId: string, id: string): Promise<WaitlistEntryDto> {
    const row = await this.prisma.bookingWaitlistEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundApiException("Waitlist entry");
    if (row.userId !== userId) throw new PetAccessDeniedException({ waitlistEntryId: id });
    const updated = await this.prisma.bookingWaitlistEntry.update({ where: { id }, data: { status: WaitlistStatus.CANCELLED }, include: INCLUDE });
    return toDto(updated);
  }

  /** Provider view: minimal fields only (pet name, window, status) — no household contact details. */
  async listForProvider(providerOrganizationId: string): Promise<WaitlistEntryDto[]> {
    await this.expireOffers({ providerOrganizationId });
    const rows = await this.prisma.bookingWaitlistEntry.findMany({
      where: { providerOrganizationId, status: { in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED, WaitlistStatus.OFFERED] }, windowEnd: { gt: new Date() } },
      include: INCLUDE,
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map(toDto);
  }

  @OnEvent("BookingCapacityReleased")
  async onCapacityReleased(payload: { providerOrganizationId: string; serviceId: string; startAt: string; endAt: string }): Promise<void> {
    try {
      await this.notifyFirstEligible(payload.providerOrganizationId, payload.serviceId, new Date(payload.startAt), new Date(payload.endAt));
    } catch (error) {
      this.logger.error("Waitlist matching failed", error instanceof Error ? error.stack : undefined);
    }
  }

  async notifyFirstEligible(providerOrganizationId: string, serviceId: string, startAt: Date, endAt: Date): Promise<string | null> {
    if (endAt <= new Date()) return null;
    const candidate = await this.prisma.bookingWaitlistEntry.findFirst({
      where: { providerOrganizationId, serviceId, status: WaitlistStatus.ACTIVE, windowStart: { lte: startAt }, windowEnd: { gte: endAt } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) return null;
    const claimed = await this.prisma.bookingWaitlistEntry.updateMany({ where: { id: candidate.id, status: WaitlistStatus.ACTIVE }, data: { status: WaitlistStatus.NOTIFIED, notifiedAt: new Date() } });
    if (claimed.count !== 1) return null;
    await this.events.publish(
      "WaitlistSlotAvailable",
      { entryId: candidate.id, userId: candidate.userId, providerOrganizationId, serviceId, startAt: startAt.toISOString() },
      { aggregateType: "BookingWaitlistEntry", aggregateId: candidate.id },
    );
    return candidate.id;
  }

  /** A confirmed booking by the same user/pet/service inside the window fulfils the entry. */
  @OnEvent("ServiceBookingConfirmed")
  async onBookingConfirmed(payload: { bookingId: string; customerUserId?: string; petId?: string; serviceId?: string; startAt?: string; endAt?: string }): Promise<void> {
    try {
      // Published inside the booking transaction: use the event's own fields, not a re-read.
      if (!payload.customerUserId || !payload.petId || !payload.serviceId || !payload.startAt || !payload.endAt) return;
      await this.prisma.bookingWaitlistEntry.updateMany({
        where: { userId: payload.customerUserId, petId: payload.petId, serviceId: payload.serviceId, status: { in: [WaitlistStatus.ACTIVE, WaitlistStatus.NOTIFIED, WaitlistStatus.OFFERED] }, windowStart: { lte: new Date(payload.startAt) }, windowEnd: { gte: new Date(payload.endAt) } },
        data: { status: WaitlistStatus.BOOKED },
      });
    } catch (error) {
      this.logger.error("Waitlist fulfilment failed", error instanceof Error ? error.stack : undefined);
    }
  }
}
