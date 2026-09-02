import { Injectable } from "@nestjs/common";
import { FulfillmentStatus, Prisma, type Fulfillment } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService, type DomainEventType } from "../../../common/events/domain-events.service";
import { FulfillmentInvalidTransitionException, FulfillmentNotFoundException } from "../../../common/errors/api-exception";

/**
 * The authoritative Fulfillment transition table (spec section 5) — every
 * status change in the system goes through `transition()` below; no other
 * code path may write `Fulfillment.status` directly. CANCELED is reachable
 * from every non-terminal state up to and including PICKUP_ASSIGNED
 * (mirrors Shipment's own CREATED/REQUESTED/ASSIGNED cancel-eligibility,
 * spec section 34); FAILED is reachable from every courier-facing state.
 * DELIVERED/FAILED/CANCELED are terminal — protected below regardless of
 * this table, never just by omission.
 */
const VALID_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  [FulfillmentStatus.PENDING]: [FulfillmentStatus.AWAITING_SELLER_PREPARATION, FulfillmentStatus.CANCELED],
  [FulfillmentStatus.AWAITING_SELLER_PREPARATION]: [FulfillmentStatus.READY_FOR_PICKUP, FulfillmentStatus.CANCELED],
  [FulfillmentStatus.READY_FOR_PICKUP]: [FulfillmentStatus.PICKUP_REQUESTED, FulfillmentStatus.CANCELED],
  [FulfillmentStatus.PICKUP_REQUESTED]: [FulfillmentStatus.PICKUP_ASSIGNED, FulfillmentStatus.FAILED, FulfillmentStatus.CANCELED],
  [FulfillmentStatus.PICKUP_ASSIGNED]: [FulfillmentStatus.PICKED_UP, FulfillmentStatus.FAILED, FulfillmentStatus.CANCELED],
  [FulfillmentStatus.PICKED_UP]: [FulfillmentStatus.IN_TRANSIT, FulfillmentStatus.FAILED],
  [FulfillmentStatus.IN_TRANSIT]: [FulfillmentStatus.OUT_FOR_DELIVERY, FulfillmentStatus.FAILED],
  [FulfillmentStatus.OUT_FOR_DELIVERY]: [FulfillmentStatus.DELIVERED, FulfillmentStatus.FAILED],
  [FulfillmentStatus.DELIVERED]: [],
  [FulfillmentStatus.FAILED]: [],
  [FulfillmentStatus.CANCELED]: [],
};

const TERMINAL_STATUSES: ReadonlySet<FulfillmentStatus> = new Set([FulfillmentStatus.DELIVERED, FulfillmentStatus.FAILED, FulfillmentStatus.CANCELED]);

/** The one Fulfillment timestamp field each status sets, if any — never overwritten once already present (spec: "previous timestamps preserved"). */
const TIMESTAMP_FIELD_BY_STATUS: Partial<Record<FulfillmentStatus, keyof Prisma.FulfillmentUpdateInput>> = {
  [FulfillmentStatus.READY_FOR_PICKUP]: "readyAt",
  [FulfillmentStatus.PICKUP_REQUESTED]: "pickupRequestedAt",
  [FulfillmentStatus.PICKUP_ASSIGNED]: "pickupAssignedAt",
  [FulfillmentStatus.PICKED_UP]: "pickedUpAt",
  [FulfillmentStatus.OUT_FOR_DELIVERY]: "outForDeliveryAt",
  [FulfillmentStatus.DELIVERED]: "deliveredAt",
};

/** Only the customer-relevant milestones get their own event — the courier-driven mirrors (PICKUP_REQUESTED..DELIVERED) are already covered by the matching Shipment.* event fired alongside them, so publishing a second event here would just be noise (spec section 35: "compact payloads... duplicate webhooks must not emit duplicate consequential business events"). */
const EVENT_BY_STATUS: Partial<Record<FulfillmentStatus, DomainEventType>> = {
  [FulfillmentStatus.READY_FOR_PICKUP]: "FulfillmentReadyForPickup",
  [FulfillmentStatus.FAILED]: "FulfillmentFailed",
  [FulfillmentStatus.CANCELED]: "FulfillmentCanceled",
};

export interface TransitionOptions {
  failureCode?: string;
  failureReason?: string;
  tx?: Prisma.TransactionClient;
}

/**
 * Single authoritative Fulfillment state-transition policy (spec section 5)
 * — every status change (manual seller-ops action, Shipment-status mirror,
 * or reconciliation) calls `transition()`, never `prisma.fulfillment.update
 * ({ data: { status } })` directly. A request to move to the fulfillment's
 * *current* status is treated as an idempotent no-op (never an error) so a
 * retried ops action or a replayed webhook can't fail on the second call;
 * a request to leave a terminal status, or to take an edge the table above
 * doesn't allow, is rejected with a structured error and never silently
 * ignored or forced through.
 */
@Injectable()
export class FulfillmentTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async transition(fulfillmentId: string, to: FulfillmentStatus, options: TransitionOptions = {}): Promise<Fulfillment> {
    const run = async (tx: Prisma.TransactionClient): Promise<Fulfillment> => {
      const current = await tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
      if (!current) throw new FulfillmentNotFoundException({ fulfillmentId });

      if (current.status === to) return current;

      if (TERMINAL_STATUSES.has(current.status)) {
        throw new FulfillmentInvalidTransitionException({ fulfillmentId, from: current.status, to, reason: "Fulfillment is already in a terminal state" });
      }
      const allowed = VALID_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(to)) {
        throw new FulfillmentInvalidTransitionException({ fulfillmentId, from: current.status, to });
      }

      const data: Prisma.FulfillmentUpdateInput = { status: to };
      const timestampField = TIMESTAMP_FIELD_BY_STATUS[to];
      if (timestampField) data[timestampField] = new Date();
      if (to === FulfillmentStatus.FAILED) {
        data.failedAt = new Date();
        if (options.failureCode) data.failureCode = options.failureCode;
        if (options.failureReason) data.failureReason = options.failureReason;
      }
      if (to === FulfillmentStatus.CANCELED) data.canceledAt = new Date();

      const updated = await tx.fulfillment.update({ where: { id: fulfillmentId }, data });

      const eventType = EVENT_BY_STATUS[to];
      if (eventType) {
        await this.events.publish(
          eventType,
          { fulfillmentId, orderId: updated.orderId, from: current.status, to, failureCode: options.failureCode },
          { tx, aggregateType: "Fulfillment", aggregateId: fulfillmentId },
        );
      }

      return updated;
    };

    if (options.tx) return run(options.tx);
    return this.prisma.$transaction(run);
  }
}
