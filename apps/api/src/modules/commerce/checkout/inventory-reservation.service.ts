import { Injectable } from "@nestjs/common";
import { InventoryReservationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { InsufficientInventoryException } from "../../../common/errors/api-exception";

/** Documented, fixed timeout (spec section 28) — correctness comes from checking `expiresAt` directly at use/confirm time, never from assuming a cleanup sweep already ran. */
export const RESERVATION_TTL_MINUTES = 15;

/**
 * The one place InventoryItem.reserved is ever mutated (spec section 27) —
 * every method here runs inside the caller's transaction so a reservation
 * row and its corresponding `reserved` delta always commit or roll back
 * together. PostgreSQL is the sole source of truth (spec section 9); there
 * is no Redis-side inventory count anywhere in this handoff.
 */
@Injectable()
export class InventoryReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Reserves `quantity` units of `sellerOfferId` for `checkoutId`. Locks the
   * InventoryItem row (`FOR UPDATE`) before checking availability so two
   * concurrent checkouts for the last unit of stock can never both
   * succeed — the second waits for the first's transaction to commit, then
   * re-reads the now-updated `reserved` value.
   */
  async reserve(tx: Prisma.TransactionClient, checkoutId: string, sellerOfferId: string, quantity: number, expiresAt: Date): Promise<void> {
    const [item] = await tx.$queryRaw<{ id: string; onHand: number; reserved: number }[]>`
      SELECT "id", "onHand", "reserved" FROM "inventory_items" WHERE "sellerOfferId" = ${sellerOfferId}::uuid FOR UPDATE
    `;
    const available = item ? item.onHand - item.reserved : 0;
    if (!item || available < quantity) {
      throw new InsufficientInventoryException({ sellerOfferId, requested: quantity, available });
    }

    await tx.inventoryItem.update({ where: { id: item.id }, data: { reserved: { increment: quantity } } });
    const reservation = await tx.inventoryReservation.create({
      data: { checkoutId, sellerOfferId, quantity, expiresAt, status: InventoryReservationStatus.ACTIVE },
    });
    await this.events.publish(
      "InventoryReserved",
      { checkoutId, sellerOfferId, quantity, reservationId: reservation.id },
      { tx, aggregateType: "InventoryReservation", aggregateId: reservation.id },
    );
  }

  /** Releases every ACTIVE reservation for a checkout back into available stock — used on explicit cancellation/expiry, never on a payment failure that should stay retryable (see README "Inventory reservation"). */
  async releaseAllForCheckout(tx: Prisma.TransactionClient, checkoutId: string): Promise<void> {
    const active = await tx.inventoryReservation.findMany({ where: { checkoutId, status: InventoryReservationStatus.ACTIVE } });
    for (const reservation of active) {
      await tx.inventoryItem.update({ where: { sellerOfferId: reservation.sellerOfferId }, data: { reserved: { decrement: reservation.quantity } } });
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: InventoryReservationStatus.RELEASED } });
      await this.events.publish("InventoryReleased", { checkoutId, reservationId: reservation.id }, { tx, aggregateType: "InventoryReservation", aggregateId: reservation.id });
    }
  }

  /** Consumes every ACTIVE reservation on successful payment — stock actually leaves onHand, not just reserved (spec section 38: "Consume inventory reservation"). */
  async consumeAllForCheckout(tx: Prisma.TransactionClient, checkoutId: string): Promise<void> {
    const active = await tx.inventoryReservation.findMany({ where: { checkoutId, status: InventoryReservationStatus.ACTIVE } });
    for (const reservation of active) {
      await tx.inventoryItem.update({
        where: { sellerOfferId: reservation.sellerOfferId },
        data: { onHand: { decrement: reservation.quantity }, reserved: { decrement: reservation.quantity } },
      });
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: InventoryReservationStatus.CONSUMED } });
    }
  }
}
