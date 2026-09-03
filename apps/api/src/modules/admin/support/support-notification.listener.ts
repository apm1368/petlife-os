import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, SupportCaseStatus, SupportMessageAuthorType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
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

  constructor(
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly prisma: PrismaService,
  ) {}

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Notification handling failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  @OnEvent("SupportMessagePosted")
  onMessagePosted(payload: { caseId: string; caseNumber: string; requesterUserId: string; authorType?: SupportMessageAuthorType }, domainEventId: string): Promise<void> {
    // A user replying to their own case must never notify themselves —
    // only an ADMIN-authored PUBLIC message is "support replies" from the
    // spec's notification list.
    if (payload.authorType === SupportMessageAuthorType.USER) return Promise.resolve();

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

  /**
   * Of the six SupportCaseStatus values, only WAITING_ON_USER is a
   * "meaningful change" a consumer needs to hear about unprompted — it maps
   * to the spec's "more information is requested". OPEN/IN_PROGRESS/
   * WAITING_ON_INTERNAL are internal churn (both collapse to the same
   * user-facing UNDER_REVIEW label — see toUserFacingStatus — so a
   * notification for either would be indistinguishable noise), RESOLVED and
   * CLOSED already have their own dedicated events/notifications.
   */
  @OnEvent("SupportCaseStatusChanged")
  onStatusChanged(payload: { caseId: string; from: SupportCaseStatus; to: SupportCaseStatus }, domainEventId: string): Promise<void> {
    if (payload.to !== SupportCaseStatus.WAITING_ON_USER) return Promise.resolve();

    return this.safely("SupportCaseStatusChanged", async () => {
      const supportCase = await this.prisma.supportCase.findUnique({ where: { id: payload.caseId } });
      if (!supportCase) return;

      await this.orchestrator.notify({
        userId: supportCase.requesterUserId,
        type: "support.more_info_requested",
        category: NotificationCategory.SUPPORT,
        templateParams: { caseNumber: supportCase.caseNumber },
        entityType: "SupportCase",
        entityId: payload.caseId,
        domainEventId,
      });
    });
  }

  @OnEvent("SupportCaseClosed")
  onCaseClosed(payload: { caseId: string; requesterUserId: string }, domainEventId: string): Promise<void> {
    return this.safely("SupportCaseClosed", async () => {
      const supportCase = await this.prisma.supportCase.findUnique({ where: { id: payload.caseId } });
      if (!supportCase) return;

      await this.orchestrator.notify({
        userId: payload.requesterUserId,
        type: "support.case_closed",
        category: NotificationCategory.SUPPORT,
        templateParams: { caseNumber: supportCase.caseNumber },
        entityType: "SupportCase",
        entityId: payload.caseId,
        domainEventId,
      });
    });
  }
}
