import { Injectable } from "@nestjs/common";
import { Prisma, ProviderEventStatus, type PaymentProvider, type PaymentProviderEvent } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export interface RecordEventInput {
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  paymentIntentId?: string;
  financingIntentId?: string;
  payloadHash?: string;
}

/**
 * The actual duplicate-webhook/replay guard (spec sections 15-18) —
 * `@@unique([provider, providerEventId])` on PaymentProviderEvent means a
 * second delivery of the same provider event id hits a unique-constraint
 * violation here, caught and reported as a duplicate *before* any
 * PaymentIntent/FinancingIntent mutation is even attempted. Deliberately
 * does not store the raw payload (spec section 17: "prefer redaction/
 * minimal retention") — only its hash, enough to notice an unexpected
 * re-delivery under the same event id with a different body.
 */
@Injectable()
export class ProviderEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordIfNew(input: RecordEventInput): Promise<{ event: PaymentProviderEvent; isDuplicate: boolean }> {
    try {
      const event = await this.prisma.paymentProviderEvent.create({
        data: {
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          paymentIntentId: input.paymentIntentId ?? null,
          financingIntentId: input.financingIntentId ?? null,
          payloadHash: input.payloadHash ?? null,
          status: ProviderEventStatus.RECEIVED,
        },
      });
      return { event, isDuplicate: false };
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.prisma.paymentProviderEvent.findUnique({
          where: { provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId } },
        });
        if (existing) {
          await this.prisma.paymentProviderEvent.update({ where: { id: existing.id }, data: { attemptCount: { increment: 1 } } });
          return { event: existing, isDuplicate: true };
        }
      }
      throw error;
    }
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.prisma.paymentProviderEvent.update({ where: { id: eventId }, data: { status: ProviderEventStatus.PROCESSED, processedAt: new Date() } });
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    await this.prisma.paymentProviderEvent.update({ where: { id: eventId }, data: { status: ProviderEventStatus.FAILED, lastError: error } });
  }

  async markIgnoredDuplicate(eventId: string): Promise<void> {
    await this.prisma.paymentProviderEvent.update({ where: { id: eventId }, data: { status: ProviderEventStatus.IGNORED_DUPLICATE } });
  }
}
