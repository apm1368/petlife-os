import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

/**
 * H10 integration for Lost Pet (spec: "Reuse H10 NotificationOrchestrator...
 * Do not spam the full community automatically"). Every notification fans
 * out to the pet's whole household only — never the wider community — the
 * same notifyHousehold shape ClinicalHealthNotificationListener already
 * established. `Notification.@@unique([domainEventId, type, userId])`
 * makes this safe against duplicate event delivery.
 */
@Injectable()
export class LostPetNotificationListener {
  private readonly logger = new Logger(LostPetNotificationListener.name);

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

  private async notifyHousehold(petId: string, type: string, incidentId: string, domainEventId: string): Promise<void> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { name: true, householdId: true } });
    if (!pet) return;
    const members = await this.prisma.householdMember.findMany({ where: { householdId: pet.householdId }, select: { userId: true } });
    await Promise.all(
      members.map((member) =>
        this.orchestrator.notify({
          userId: member.userId,
          type,
          category: NotificationCategory.LOST_PET,
          priority: NotificationPriority.URGENT,
          templateParams: { petName: pet.name },
          householdId: pet.householdId,
          petId,
          entityType: "LostPetIncident",
          entityId: incidentId,
          domainEventId,
        }),
      ),
    );
  }

  @OnEvent("LostPetIncidentOpened")
  onIncidentOpened(payload: { petId: string; incidentId: string }, domainEventId: string): Promise<void> {
    return this.safely("LostPetIncidentOpened", async () => {
      await this.notifyHousehold(payload.petId, "lost_pet.incident_opened", payload.incidentId, domainEventId);
    });
  }

  @OnEvent("LostPetSightingSubmitted")
  onSightingSubmitted(payload: { petId: string; incidentId: string; sightingId: string }, domainEventId: string): Promise<void> {
    return this.safely("LostPetSightingSubmitted", async () => {
      await this.notifyHousehold(payload.petId, "lost_pet.sighting_submitted", payload.incidentId, domainEventId);
    });
  }

  @OnEvent("LostPetMarkedFound")
  onMarkedFound(payload: { petId: string; incidentId: string }, domainEventId: string): Promise<void> {
    return this.safely("LostPetMarkedFound", async () => {
      await this.notifyHousehold(payload.petId, "lost_pet.marked_found", payload.incidentId, domainEventId);
    });
  }

  @OnEvent("LostPetReunited")
  onReunited(payload: { petId: string; incidentId: string }, domainEventId: string): Promise<void> {
    return this.safely("LostPetReunited", async () => {
      await this.notifyHousehold(payload.petId, "lost_pet.reunited", payload.incidentId, domainEventId);
    });
  }
}
