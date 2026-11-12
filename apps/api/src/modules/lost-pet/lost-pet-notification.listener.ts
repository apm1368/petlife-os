import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { LostPetAreaAlertService } from "./lost-pet-area-alert.service";

/**
 * H10 integration for Lost Pet (spec: "Reuse H10 NotificationOrchestrator...
 * Do not spam the full community automatically"). Every notification fans
 * out to the pet's whole household only — never the wider community — the
 * same notifyHousehold shape ClinicalHealthNotificationListener already
 * established. `Notification.@@unique([domainEventId, type, userId])`
 * makes this safe against duplicate event delivery.
 *
 * #290 Q53 adds one opt-in exception: members who switched on a neighbourhood alert hear about a new report whose
 * private last-seen point falls inside their own radius (capped, nearest first). They get the public page only,
 * with the pet's name and the owner's public area; never the coordinates, the household or any contact.
 */
@Injectable()
export class LostPetNotificationListener {
  private readonly logger = new Logger(LostPetNotificationListener.name);

  constructor(
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly areaAlerts: LostPetAreaAlertService,
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
          deepLink: NotificationDeepLinks.lostIncident(petId, incidentId),
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

  @OnEvent("LostPetIncidentOpened")
  onIncidentOpenedNearby(payload: { petId: string; incidentId: string }, domainEventId: string): Promise<void> {
    return this.safely("LostPetIncidentOpened (nearby)", async () => {
      const incident = await this.prisma.lostPetIncident.findUnique({
        where: { id: payload.incidentId },
        select: { status: true, householdId: true, lastKnownLatitude: true, lastKnownLongitude: true, publicArea: true, pet: { select: { name: true } } },
      });
      if (!incident || incident.status !== "OPEN" || incident.lastKnownLatitude == null || incident.lastKnownLongitude == null) return;
      const household = await this.prisma.householdMember.findMany({ where: { householdId: incident.householdId }, select: { userId: true } });
      const recipients = await this.areaAlerts.recipientsNear(incident.lastKnownLatitude, incident.lastKnownLongitude, household.map((m) => m.userId));
      for (const userId of recipients) {
        await this.orchestrator.notify({
          userId,
          type: "lost_pet.nearby_opened",
          category: NotificationCategory.LOST_PET,
          priority: NotificationPriority.NORMAL,
          templateParams: { petName: incident.pet.name, area: incident.publicArea?.trim() || "—" },
          entityType: "LostPetIncident",
          entityId: payload.incidentId,
          deepLink: NotificationDeepLinks.publicLostIncident(payload.incidentId),
          domainEventId,
        });
      }
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
