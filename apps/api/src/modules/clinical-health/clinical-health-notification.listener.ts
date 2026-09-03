import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

/**
 * H10 integration for the Advanced Health / Clinical OS domain (spec: "Use
 * existing NotificationOrchestrator... do not expose detailed diagnosis in
 * SMS"). Every notification here fans out to the pet's whole household
 * (mirrors SubscriptionNotificationListener's own precedent) — a medical
 * document or care plan update is relevant to every household member, not
 * just whoever triggered it. `Notification.@@unique([domainEventId, type,
 * userId])` makes this safe against duplicate event delivery.
 *
 * Deliberately NOT wired: "health.follow_up_due" has a template (see
 * notification-templates.ts) but no firing event — there is no proactive
 * due-date-scanning job in this phase (same documented gap as H16's own
 * "trial_ending"/"renewal_upcoming" omission), so a CarePlanItem's dueAt
 * elapsing does not itself notify anyone yet.
 */
@Injectable()
export class ClinicalHealthNotificationListener {
  private readonly logger = new Logger(ClinicalHealthNotificationListener.name);

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

  private async notifyHousehold(petId: string, type: string, entityType: string, entityId: string, domainEventId: string): Promise<void> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { name: true, householdId: true } });
    if (!pet) return;
    const members = await this.prisma.householdMember.findMany({ where: { householdId: pet.householdId }, select: { userId: true } });
    await Promise.all(
      members.map((member) =>
        this.orchestrator.notify({
          userId: member.userId,
          type,
          category: NotificationCategory.HEALTH,
          templateParams: { petName: pet.name },
          householdId: pet.householdId,
          entityType,
          entityId,
          domainEventId,
        }),
      ),
    );
  }

  @OnEvent("MedicalDocumentAdded")
  onDocumentAdded(payload: { petId: string; documentId: string; sourceType: string }, domainEventId: string): Promise<void> {
    return this.safely("MedicalDocumentAdded", async () => {
      // Only notify for a PROVIDER-sourced document — an owner's own upload needs no notification (they already know they uploaded it).
      if (payload.sourceType !== "PROVIDER" && payload.sourceType !== "CLINIC") return;
      await this.notifyHousehold(payload.petId, "health.document_added", "MedicalDocument", payload.documentId, domainEventId);
    });
  }

  @OnEvent("ReferralCreated")
  onReferralCreated(payload: { petId: string; referralId: string }, domainEventId: string): Promise<void> {
    return this.safely("ReferralCreated", async () => {
      await this.notifyHousehold(payload.petId, "health.referral_created", "Referral", payload.referralId, domainEventId);
    });
  }

  @OnEvent("ReferralStatusChanged")
  onReferralStatusChanged(payload: { petId: string; referralId: string }, domainEventId: string): Promise<void> {
    return this.safely("ReferralStatusChanged", async () => {
      await this.notifyHousehold(payload.petId, "health.referral_updated", "Referral", payload.referralId, domainEventId);
    });
  }

  @OnEvent("CarePlanUpdated")
  onCarePlanUpdated(payload: { petId: string; carePlanId: string }, domainEventId: string): Promise<void> {
    return this.safely("CarePlanUpdated", async () => {
      await this.notifyHousehold(payload.petId, "health.care_plan_updated", "CarePlan", payload.carePlanId, domainEventId);
    });
  }
}
