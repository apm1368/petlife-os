import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory } from "@prisma/client";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";

/**
 * Support notifications route through H10's NotificationOrchestrator only
 * (spec: "never call SMS directly") — mirrors NotificationEventsListener's
 * own shape exactly. `SupportMessagePosted` only ever fires for PUBLIC
 * messages (see SupportCaseService.postMessage) so there is no visibility
 * check needed here — an INTERNAL reply never reaches this listener at all.
 */
@Injectable()
export class SupportNotificationListener {
  private readonly logger = new Logger(SupportNotificationListener.name);

  constructor(private readonly orchestrator: NotificationOrchestratorService) {}

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Notification handling failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  @OnEvent("SupportMessagePosted")
  onMessagePosted(payload: { caseId: string; caseNumber: string; requesterUserId: string }, domainEventId: string): Promise<void> {
    return this.safely("SupportMessagePosted", async () => {
      await this.orchestrator.notify({
        userId: payload.requesterUserId,
        type: "support.message_posted",
        category: NotificationCategory.SUPPORT,
        templateParams: { caseNumber: payload.caseNumber },
        entityType: "SupportCase",
        entityId: payload.caseId,
        domainEventId,
      });
    });
  }

  @OnEvent("SupportCaseResolved")
  onCaseResolved(payload: { caseId: string; caseNumber: string; requesterUserId: string }, domainEventId: string): Promise<void> {
    return this.safely("SupportCaseResolved", async () => {
      await this.orchestrator.notify({
        userId: payload.requesterUserId,
        type: "support.case_resolved",
        category: NotificationCategory.SUPPORT,
        templateParams: { caseNumber: payload.caseNumber },
        entityType: "SupportCase",
        entityId: payload.caseId,
        domainEventId,
      });
    });
  }
}
