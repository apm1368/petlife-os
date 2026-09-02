import { Injectable } from "@nestjs/common";
import { InventoryMovementType, type InventoryItem, type InventoryMovement, type Prisma } from "@prisma/client";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { InventoryMovementInvalidException } from "../../../common/errors/api-exception";

export interface ApplyOnHandDeltaInput {
  inventoryItemId: string;
  sellerOrganizationId: string;
  delta: number;
  type: InventoryMovementType;
  source: string;
  sourceReference?: string;
  reason?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The single place `InventoryItem.onHand` is ever mutated outside the
 * Checkout-time reservation flow (spec section 8-10) — Handoff 06's
 * InventoryReservationService (in CheckoutModule) remains the sole owner of
 * `reserved` and the ACTIVE/RELEASED/CONSUMED InventoryReservation
 * lifecycle, untouched by this handoff; this service instead covers every
 * *direct* onHand change a checkout reservation was never involved in —
 * manual seller adjustments and marketplace order commit/cancellation.
 * Deliberately standalone (not importing CheckoutModule) so SellerOsModule
 * and the future MarketplaceModule can both depend on it without a module
 * cycle, the same avoidance pattern RefundsService/ShippingOrchestrator use
 * for cross-domain Prisma access.
 *
 * Every call takes the caller's own transaction and locks the InventoryItem
 * row (`FOR UPDATE`) before checking availability, so two concurrent
 * mutations (a manual seller edit racing a marketplace order, or two
 * marketplace orders for the last unit) serialize at the database level —
 * the second waits for the first's transaction to commit, then re-reads the
 * now-updated row (spec section 10, the "Race" pattern established by
 * InventoryReservationService/ShippingOrchestrator in Handoffs 06/08).
 * Never allows `onHand - reserved` (available) to go negative — this
 * project does not model backorders (spec section 7).
 */
@Injectable()
export class InventoryMovementService {
  constructor(private readonly events: DomainEventsService) {}

  async applyOnHandDelta(tx: Prisma.TransactionClient, input: ApplyOnHandDeltaInput): Promise<{ inventoryItem: InventoryItem; movement: InventoryMovement }> {
    const [locked] = await tx.$queryRaw<{ id: string; onHand: number; reserved: number }[]>`
      SELECT "id", "onHand", "reserved" FROM "inventory_items" WHERE "id" = ${input.inventoryItemId}::uuid FOR UPDATE
    `;
    if (!locked) throw new InventoryMovementInvalidException({ inventoryItemId: input.inventoryItemId, reason: "INVENTORY_ITEM_NOT_FOUND" });

    const quantityBefore = locked.onHand;
    const quantityAfter = quantityBefore + input.delta;
    const availableAfter = quantityAfter - locked.reserved;
    if (quantityAfter < 0 || availableAfter < 0) {
      throw new InventoryMovementInvalidException({
        inventoryItemId: input.inventoryItemId,
        onHand: quantityBefore,
        reserved: locked.reserved,
        requestedDelta: input.delta,
      });
    }

    const inventoryItem = await tx.inventoryItem.update({ where: { id: input.inventoryItemId }, data: { onHand: quantityAfter } });
    const movement = await tx.inventoryMovement.create({
      data: {
        inventoryItemId: input.inventoryItemId,
        sellerOrganizationId: input.sellerOrganizationId,
        type: input.type,
        quantityDelta: input.delta,
        quantityBefore,
        quantityAfter,
        source: input.source,
        sourceReference: input.sourceReference,
        reason: input.reason,
        actorUserId: input.actorUserId,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
    await this.events.publish(
      "InventoryAdjusted",
      { inventoryItemId: input.inventoryItemId, sellerOrganizationId: input.sellerOrganizationId, type: input.type, delta: input.delta, quantityAfter },
      { tx, aggregateType: "InventoryItem", aggregateId: input.inventoryItemId },
    );

    return { inventoryItem, movement };
  }
}
