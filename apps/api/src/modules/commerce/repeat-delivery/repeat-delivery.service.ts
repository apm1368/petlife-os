import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, RepeatDeliveryStatus, SellerOfferStatus, SellerStatus, SellerVerificationStatus, ProductStatus } from "@prisma/client";
import type { CartDto, RepeatDeliveryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ApiException, HouseholdAccessDeniedException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { PricingService } from "../promotions/pricing.service";
import { CartService } from "../cart/cart.service";
import { toSellerSummaryDto } from "../commerce-dto.mapper";

export class RepeatDeliveryConflictException extends ApiException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

const DAY = 86_400_000;
/** A cycle is "due" (reminder sent, order may be placed) this long before its date. */
export const REPEAT_REMINDER_LEAD_DAYS = 2;

const SCHEDULE_INCLUDE = {
  productVariant: { include: { product: { include: { media: { orderBy: { sortOrder: "asc" as const }, take: 1 } } } } },
  sellerOffer: { include: { sellerOrganization: true, inventoryItem: true, productVariant: { include: { product: true } } } },
  address: true,
  events: { orderBy: { createdAt: "desc" as const }, take: 20 },
} satisfies Prisma.RepeatDeliveryScheduleInclude;

type ScheduleRow = Prisma.RepeatDeliveryScheduleGetPayload<{ include: typeof SCHEDULE_INCLUDE }>;

export interface CreateRepeatDeliveryInput {
  sellerOfferId: string;
  quantity: number;
  intervalDays: number;
  addressId: string;
  firstDeliveryAt?: string;
}

export interface UpdateRepeatDeliveryInput {
  quantity?: number;
  intervalDays?: number;
  addressId?: string;
}

/**
 * Repeat Delivery (Batch 4) — a reminder-driven subscription, never an
 * autopay. PET LIFE has no stored-credential payment rail, so each cycle is
 * a normal checkout the customer confirms:
 *
 *   ACTIVE → (REPEAT_REMINDER_LEAD_DAYS before nextCycleAt) reminder →
 *   customer "Order this cycle" → the line is placed in their cart at the
 *   live server price → normal checkout → the resulting order advances
 *   nextCycleAt (OrdersService.createForCheckout).
 *
 * Price is revalidated every cycle: if the live price differs from the
 * price the customer last accepted, ordering is blocked until they accept
 * the new price. Offers that stop being eligible, active or in stock are
 * reported as unavailable instead of silently switching seller.
 */
@Injectable()
export class RepeatDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly pricing: PricingService,
    private readonly cart: CartService,
  ) {}

  async list(userId: string): Promise<RepeatDeliveryDto[]> {
    const rows = await this.prisma.repeatDeliverySchedule.findMany({
      where: { userId },
      include: SCHEDULE_INCLUDE,
      orderBy: [{ status: "asc" }, { nextCycleAt: "asc" }, { id: "asc" }],
    });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async get(userId: string, id: string): Promise<RepeatDeliveryDto> {
    return this.toDto(await this.loadOwned(userId, id));
  }

  async create(userId: string, input: CreateRepeatDeliveryInput): Promise<RepeatDeliveryDto> {
    const offer = await this.prisma.sellerOffer.findUnique({ where: { id: input.sellerOfferId }, include: { productVariant: { include: { product: true } }, sellerOrganization: true } });
    if (!offer || offer.status !== SellerOfferStatus.ACTIVE || !this.sellerOpen(offer.sellerOrganization) || offer.productVariant.product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundApiException("Offer", { sellerOfferId: input.sellerOfferId });
    }
    if (!offer.repeatDeliveryEligible) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_NOT_OFFERED", "This seller does not offer repeat delivery for this item.");
    if (!offer.repeatIntervalsDays.includes(input.intervalDays)) throw new ValidationApiException({ field: "intervalDays", reason: "INTERVAL_NOT_OFFERED", allowed: offer.repeatIntervalsDays });
    const householdId = await this.assertAddress(userId, input.addressId);
    const firstAt = input.firstDeliveryAt ? new Date(input.firstDeliveryAt) : new Date(Date.now() + input.intervalDays * DAY);
    if (Number.isNaN(firstAt.getTime()) || firstAt.getTime() < Date.now() - DAY || firstAt.getTime() > Date.now() + 180 * DAY) {
      throw new ValidationApiException({ field: "firstDeliveryAt", reason: "OUT_OF_RANGE" });
    }
    const price = await this.livePrice(offer);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.repeatDeliverySchedule.create({
          data: {
            userId,
            householdId,
            productVariantId: offer.productVariantId,
            sellerOfferId: offer.id,
            quantity: input.quantity,
            intervalDays: input.intervalDays,
            nextCycleAt: firstAt,
            addressId: input.addressId,
            acceptedUnitPrice: price,
          },
        });
        await tx.repeatDeliveryEvent.create({ data: { scheduleId: created.id, type: "CREATED", actorId: userId, data: { quantity: input.quantity, intervalDays: input.intervalDays, unitPrice: price } } });
        await this.events.publish("RepeatDeliveryCreated", { scheduleId: created.id, userId }, { tx, aggregateType: "RepeatDeliverySchedule", aggregateId: created.id });
        return created;
      });
      return this.get(userId, row.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_EXISTS", "You already have a repeat delivery for this item.");
      }
      throw error;
    }
  }

  async update(userId: string, id: string, input: UpdateRepeatDeliveryInput): Promise<RepeatDeliveryDto> {
    const current = await this.loadOwned(userId, id);
    this.assertNotCancelled(current);
    if (input.intervalDays !== undefined && !current.sellerOffer.repeatIntervalsDays.includes(input.intervalDays)) {
      throw new ValidationApiException({ field: "intervalDays", reason: "INTERVAL_NOT_OFFERED", allowed: current.sellerOffer.repeatIntervalsDays });
    }
    const householdId = input.addressId ? await this.assertAddress(userId, input.addressId) : undefined;
    await this.mutate(current, userId, "UPDATED", { ...input }, {
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.intervalDays !== undefined ? { intervalDays: input.intervalDays } : {}),
      ...(input.addressId ? { addressId: input.addressId, householdId } : {}),
    });
    return this.get(userId, id);
  }

  async skip(userId: string, id: string): Promise<RepeatDeliveryDto> {
    const current = await this.loadOwned(userId, id);
    if (current.status !== RepeatDeliveryStatus.ACTIVE) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_NOT_ACTIVE", "Only an active repeat delivery can skip a cycle.");
    const next = new Date(current.nextCycleAt.getTime() + current.intervalDays * DAY);
    await this.mutate(current, userId, "SKIPPED", { skipped: current.nextCycleAt.toISOString(), next: next.toISOString() }, { nextCycleAt: next, reminderSentAt: null });
    return this.get(userId, id);
  }

  async pause(userId: string, id: string): Promise<RepeatDeliveryDto> {
    const current = await this.loadOwned(userId, id);
    if (current.status !== RepeatDeliveryStatus.ACTIVE) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_NOT_ACTIVE", "Only an active repeat delivery can be paused.");
    await this.mutate(current, userId, "PAUSED", null, { status: RepeatDeliveryStatus.PAUSED, reminderSentAt: null });
    return this.get(userId, id);
  }

  async resume(userId: string, id: string): Promise<RepeatDeliveryDto> {
    const current = await this.loadOwned(userId, id);
    if (current.status !== RepeatDeliveryStatus.PAUSED) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_NOT_PAUSED", "Only a paused repeat delivery can be resumed.");
    // A cycle date that passed while paused moves forward by whole intervals, never into the past.
    let next = current.nextCycleAt.getTime();
    while (next < Date.now()) next += current.intervalDays * DAY;
    await this.mutate(current, userId, "RESUMED", { next: new Date(next).toISOString() }, { status: RepeatDeliveryStatus.ACTIVE, nextCycleAt: new Date(next), reminderSentAt: null });
    return this.get(userId, id);
  }

  async cancel(userId: string, id: string): Promise<RepeatDeliveryDto> {
    const current = await this.loadOwned(userId, id);
    this.assertNotCancelled(current);
    await this.mutate(current, userId, "CANCELLED", null, { status: RepeatDeliveryStatus.CANCELLED, reminderSentAt: null });
    return this.get(userId, id);
  }

  async acceptCurrentPrice(userId: string, id: string): Promise<RepeatDeliveryDto> {
    const current = await this.loadOwned(userId, id);
    this.assertNotCancelled(current);
    const price = await this.livePrice(current.sellerOffer);
    await this.mutate(current, userId, "PRICE_ACCEPTED", { from: current.acceptedUnitPrice, to: price }, { acceptedUnitPrice: price });
    return this.get(userId, id);
  }

  /**
   * "Order this cycle": revalidates offer, stock and price, then puts the
   * line in the customer's cart. The customer completes an ordinary
   * checkout; nothing is charged here.
   */
  async prepareCycleOrder(userId: string, id: string): Promise<CartDto> {
    const current = await this.loadOwned(userId, id);
    if (current.status !== RepeatDeliveryStatus.ACTIVE) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_NOT_ACTIVE", "Resume this repeat delivery first.");
    const offer = current.sellerOffer;
    if (offer.status !== SellerOfferStatus.ACTIVE || !offer.repeatDeliveryEligible || !this.sellerOpen(offer.sellerOrganization) || offer.productVariant.product.status !== ProductStatus.ACTIVE) {
      throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_OFFER_UNAVAILABLE", "This item is no longer available from this seller.");
    }
    const available = Math.max(0, (offer.inventoryItem?.onHand ?? 0) - (offer.inventoryItem?.reserved ?? 0));
    if (available < current.quantity) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_OUT_OF_STOCK", "Not enough stock for this cycle right now.", { available });
    const price = await this.livePrice(offer);
    if (price !== current.acceptedUnitPrice) {
      throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_PRICE_CHANGED", "The price changed since you last confirmed it.", { acceptedUnitPrice: current.acceptedUnitPrice, currentUnitPrice: price });
    }

    const cart = await this.cart.getCart(userId);
    const existing = cart.sellerGroups.flatMap((g) => g.lines).find((l) => l.sellerOffer.id === offer.id);
    if (existing) {
      if (existing.quantity !== current.quantity) await this.cart.updateItem(userId, existing.id, { quantity: current.quantity });
    } else {
      await this.cart.addItem(userId, { offerId: offer.id, quantity: current.quantity });
    }
    await this.prisma.repeatDeliveryEvent.create({ data: { scheduleId: id, type: "CYCLE_PREPARED", actorId: userId, data: { quantity: current.quantity, unitPrice: price } } });
    return this.cart.getCart(userId);
  }

  /** Worker entry: mark schedules entering their reminder window and emit one RepeatDeliveryDue each (claimed atomically). */
  async sendDueReminders(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + REPEAT_REMINDER_LEAD_DAYS * DAY);
    const due = await this.prisma.repeatDeliverySchedule.findMany({
      where: { status: RepeatDeliveryStatus.ACTIVE, reminderSentAt: null, nextCycleAt: { lte: horizon } },
      select: { id: true, userId: true, nextCycleAt: true },
      take: 200,
    });
    let sent = 0;
    for (const row of due) {
      const claimed = await this.prisma.$transaction(async (tx) => {
        const res = await tx.repeatDeliverySchedule.updateMany({ where: { id: row.id, status: RepeatDeliveryStatus.ACTIVE, reminderSentAt: null }, data: { reminderSentAt: now } });
        if (res.count === 0) return false;
        await tx.repeatDeliveryEvent.create({ data: { scheduleId: row.id, type: "REMINDER_SENT", data: { cycleAt: row.nextCycleAt.toISOString() } } });
        await this.events.publish("RepeatDeliveryDue", { scheduleId: row.id, userId: row.userId, cycleAt: row.nextCycleAt.toISOString() }, { tx, aggregateType: "RepeatDeliverySchedule", aggregateId: row.id });
        return true;
      });
      if (claimed) sent++;
    }
    return sent;
  }

  // ------------------------------------------------------------------ helpers

  private sellerOpen(seller: { verificationStatus: SellerVerificationStatus; status: SellerStatus }): boolean {
    return seller.verificationStatus === SellerVerificationStatus.VERIFIED && seller.status === SellerStatus.ACTIVE;
  }

  private async livePrice(offer: { id: string; priceAmount: number; sellerOrganizationId: string; productVariant: { product: { id: string; categoryId: string } } }): Promise<number> {
    const prices = await this.pricing.price([
      { offerId: offer.id, priceAmount: offer.priceAmount, sellerOrganizationId: offer.sellerOrganizationId, productId: offer.productVariant.product.id, categoryId: offer.productVariant.product.categoryId },
    ]);
    return prices.get(offer.id)!.unitPrice;
  }

  private async assertAddress(userId: string, addressId: string): Promise<string> {
    const address = await this.prisma.customerAddress.findUnique({ where: { id: addressId }, select: { householdId: true } });
    if (!address) throw new ValidationApiException({ field: "addressId", reason: "Address not found" });
    const member = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: address.householdId, userId } } });
    if (!member) throw new HouseholdAccessDeniedException({ householdId: address.householdId });
    return address.householdId;
  }

  private assertNotCancelled(row: { status: RepeatDeliveryStatus }): void {
    if (row.status === RepeatDeliveryStatus.CANCELLED) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_CANCELLED", "This repeat delivery was cancelled.");
  }

  /** Optimistic update keyed on updatedAt, so two tabs cannot silently overwrite each other. */
  private async mutate(current: ScheduleRow, actorId: string, type: string, data: Record<string, unknown> | null, patch: Prisma.RepeatDeliveryScheduleUncheckedUpdateManyInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.repeatDeliverySchedule.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: patch });
      if (res.count === 0) throw new RepeatDeliveryConflictException("REPEAT_DELIVERY_CHANGED", "This repeat delivery changed in the meantime. Refresh and try again.");
      await tx.repeatDeliveryEvent.create({ data: { scheduleId: current.id, type, actorId, data: (data ?? undefined) as Prisma.InputJsonValue | undefined } });
      await this.events.publish("RepeatDeliveryChanged", { scheduleId: current.id, userId: current.userId, change: type }, { tx, aggregateType: "RepeatDeliverySchedule", aggregateId: current.id });
    });
  }

  private async loadOwned(userId: string, id: string): Promise<ScheduleRow> {
    const row = await this.prisma.repeatDeliverySchedule.findUnique({ where: { id }, include: SCHEDULE_INCLUDE });
    if (!row || row.userId !== userId) throw new NotFoundApiException("Repeat delivery", { id });
    return row;
  }

  private async toDto(r: ScheduleRow): Promise<RepeatDeliveryDto> {
    const offer = r.sellerOffer;
    const offerOpen = offer.status === SellerOfferStatus.ACTIVE && offer.repeatDeliveryEligible && this.sellerOpen(offer.sellerOrganization) && offer.productVariant.product.status === ProductStatus.ACTIVE;
    const available = Math.max(0, (offer.inventoryItem?.onHand ?? 0) - (offer.inventoryItem?.reserved ?? 0));
    const currentUnitPrice = offerOpen ? await this.livePrice(offer) : null;
    const product = r.productVariant.product;
    return {
      id: r.id,
      status: r.status as RepeatDeliveryDto["status"],
      product: { id: product.id, title: product.title, imageUrl: product.media[0]?.url ?? null },
      variantTitle: r.productVariant.title,
      sellerOrganization: toSellerSummaryDto(offer.sellerOrganization),
      sellerOfferId: offer.id,
      quantity: r.quantity,
      intervalDays: r.intervalDays,
      allowedIntervalsDays: offer.repeatIntervalsDays,
      nextCycleAt: r.nextCycleAt.toISOString(),
      addressId: r.addressId,
      addressLabel: r.address ? r.address.label ?? `${r.address.city} — ${r.address.addressLine}`.slice(0, 80) : null,
      acceptedUnitPrice: r.acceptedUnitPrice,
      currentUnitPrice,
      priceChanged: currentUnitPrice !== null && currentUnitPrice !== r.acceptedUnitPrice,
      available: offerOpen && available >= r.quantity,
      lastOrderId: r.lastOrderId,
      events: r.events.map((e) => ({ type: e.type, note: null, createdAt: e.createdAt.toISOString() })),
      createdAt: r.createdAt.toISOString(),
    };
  }
}
