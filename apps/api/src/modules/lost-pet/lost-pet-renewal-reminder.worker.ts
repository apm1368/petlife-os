import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { LostPetIncidentStatus, NotificationCategory, NotificationPriority } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

const REMINDER_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ACTIVE_INCIDENT_STATUSES = [
  LostPetIncidentStatus.OPEN,
  LostPetIncidentStatus.SEARCHING,
  LostPetIncidentStatus.SIGHTING_REPORTED,
] as const;

function stableEventId(incidentId: string): string {
  const hex = createHash("sha256").update(`lost-pet-renewal:${incidentId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/**
 * LP-06's single 30-day reminder.  This is an internal, persisted
 * notification workflow: it neither relies on an SMS provider nor exposes a
 * stale report as renewed.  A stable DomainEvent id plus Notification's
 * unique key makes retries and concurrent API processes safe.
 */
@Injectable()
export class LostPetRenewalReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LostPetRenewalReminderWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("lost-pet-renewal-reminders", POLL_INTERVAL_MS);
    this.timer = setInterval(() => {
      trackWorker("lost-pet-renewal-reminders", POLL_INTERVAL_MS, () => this.processDueReminders()).catch(
        (error) =>
          this.logger.error(
            "Lost-pet renewal reminder tick failed",
            error instanceof Error ? error.stack : undefined,
          ),
      );
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Exported for deterministic tests and a future operational trigger. */
  async processDueReminders(now = new Date(), limit = 100): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.lostPetIncident.findMany({
        where: {
          status: { in: [...ACTIVE_INCIDENT_STATUSES] },
          renewalReminderSentAt: null,
          createdAt: { lte: new Date(now.getTime() - REMINDER_AFTER_MS) },
        },
        include: {
          pet: { select: { name: true, householdId: true } },
          household: { select: { members: { select: { userId: true } } } },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
      });

      let delivered = 0;
      for (const incident of due) {
        const eventId = stableEventId(incident.id);
        await this.prisma.domainEvent.upsert({
          where: { id: eventId },
          create: {
            id: eventId,
            type: "LostPetRenewalReminderDue",
            aggregateType: "LostPetIncident",
            aggregateId: incident.id,
            payload: {
              incidentId: incident.id,
              petId: incident.petId,
              dueAt: incident.createdAt.toISOString(),
            },
            processedAt: now,
          },
          update: {},
        });

        for (const member of incident.household.members) {
          await this.notifications.notify({
            userId: member.userId,
            type: "lost_pet.renewal_due",
            category: NotificationCategory.LOST_PET,
            priority: NotificationPriority.HIGH,
            householdId: incident.pet.householdId,
            petId: incident.petId,
            entityType: "LostPetIncident",
            entityId: incident.id,
            deepLink: NotificationDeepLinks.lostIncident(incident.petId, incident.id),
            domainEventId: eventId,
            templateParams: { petName: incident.pet.name },
            metadata: { reminderAfterDays: 30 },
          });
        }

        // Claim after notification succeeds. If a process fails beforehand,
        // the stable event id lets the next tick retry without duplicate user
        // notifications. Closed/reunited rows can never be marked later.
        const claimed = await this.prisma.lostPetIncident.updateMany({
          where: {
            id: incident.id,
            renewalReminderSentAt: null,
            status: { in: [...ACTIVE_INCIDENT_STATUSES] },
          },
          data: { renewalReminderSentAt: now },
        });
        delivered += claimed.count;
      }
      return delivered;
    } finally {
      this.running = false;
    }
  }
}
