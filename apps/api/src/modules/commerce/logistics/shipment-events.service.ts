import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma, type ShipmentEvent, type ShipmentStatus, type ShippingProvider } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export interface RecordShipmentEventInput {
  shipmentId: string;
  provider: ShippingProvider;
  providerEventId: string;
  eventType: string;
  providerStatus?: string;
  canonicalStatus: ShipmentStatus;
  occurredAt: Date;
  payloadSnapshot?: Prisma.InputJsonValue;
}

/**
 * Append-oriented provider event log (spec section 17) — `@@unique([
 * provider, providerEventId])` on ShipmentEvent is the actual
 * duplicate-webhook guard, checked here before any Shipment/Fulfillment
 * mutation is attempted, exactly mirroring ProviderEventsService (Handoff
 * 07). Never updates an existing row's content beyond returning it as the
 * duplicate — historical event rows are immutable (spec: "do not overwrite
 * historical event rows").
 */
@Injectable()
export class ShipmentEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordIfNew(input: RecordShipmentEventInput): Promise<{ event: ShipmentEvent; isDuplicate: boolean }> {
    try {
      const event = await this.prisma.shipmentEvent.create({
        data: {
          shipmentId: input.shipmentId,
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          providerStatus: input.providerStatus ?? null,
          canonicalStatus: input.canonicalStatus,
          occurredAt: input.occurredAt,
          payloadSnapshot: input.payloadSnapshot,
        },
      });
      return { event, isDuplicate: false };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.prisma.shipmentEvent.findUnique({
          where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } },
        });
        if (existing) return { event: existing, isDuplicate: true };
      }
      throw error;
    }
  }

  /**
   * Deterministic fallback id for a provider with no stable event id (spec
   * section 17: "do not use a random UUID alone for deduplication") — a
   * hash of the stable, documented fields (provider + providerShipmentId +
   * eventType + occurredAt) so a genuine replay of the same event produces
   * the same fingerprint and is caught by the unique constraint above.
   */
  static fingerprint(provider: ShippingProvider, providerShipmentId: string, eventType: string, occurredAt: Date): string {
    return createHash("sha256").update(`${provider}:${providerShipmentId}:${eventType}:${occurredAt.toISOString()}`).digest("hex");
  }
}
