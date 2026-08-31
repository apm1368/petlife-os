import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const DOMAIN_EVENT_TYPES = [
  "UserAuthenticated",
  "HouseholdCreated",
  "PetCreated",
  "ActivePetChanged",
  "OnboardingCompleted",
  "PetProfileUpdated",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/**
 * Outbox-shaped: every event is persisted to `domain_events` before being
 * dispatched in-process via EventEmitter2. Today the dispatch is synchronous
 * and best-effort; evolving to an at-least-once relay only means adding a
 * poller that reads unprocessed rows and marks `processedAt` — no schema or
 * call-site change required.
 */
@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  async publish(type: DomainEventType, payload: Record<string, unknown>): Promise<void> {
    const event = await this.prisma.domainEvent.create({
      data: { type, payload: payload as Prisma.InputJsonValue },
    });

    try {
      this.emitter.emit(type, payload);
      await this.prisma.domainEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to dispatch domain event ${type} (${event.id})`, error instanceof Error ? error.stack : undefined);
    }
  }
}
