import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { LostPetAreaAlertService } from "./lost-pet-area-alert.service";

const DAY_MS = 24 * 3600 * 1000;
const NEARBY_TYPE = "lost_pet.nearby_opened";
/** Neighbourhood fan-outs one household or one reporting member may trigger a day. */
const NEARBY_PER_REPORTER_PER_DAY = 2;
/** Neighbourhood alerts one member receives a day, whoever reports. */
const NEARBY_PER_RECIPIENT_PER_DAY = 3;

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
        select: { status: true, petId: true, householdId: true, createdByUserId: true, lastKnownLatitude: true, lastKnownLongitude: true, publicArea: true, pet: { select: { name: true } } },
      });
      if (!incident || incident.status !== "OPEN" || incident.lastKnownLatitude == null || incident.lastKnownLongitude == null) return;
      if (!(await this.nearbyFanOutAllowed(incident, payload.incidentId))) return;
      const household = await this.prisma.householdMember.findMany({ where: { householdId: incident.householdId }, select: { userId: true } });
      const candidates = await this.areaAlerts.recipientsNear(incident.lastKnownLatitude, incident.lastKnownLongitude, household.map((m) => m.userId));
      const since = new Date(Date.now() - DAY_MS);
      const received = candidates.length
        ? await this.prisma.notification.groupBy({ by: ["userId"], where: { userId: { in: candidates }, type: NEARBY_TYPE, createdAt: { gte: since } }, _count: { _all: true } })
        : [];
      const saturated = new Set(received.filter((r) => r._count._all >= NEARBY_PER_RECIPIENT_PER_DAY).map((r) => r.userId));
      for (const userId of candidates) {
        if (saturated.has(userId)) continue;
        await this.orchestrator.notify({
          userId,
          type: NEARBY_TYPE,
          category: NotificationCategory.LOST_PET,
          priority: NotificationPriority.NORMAL,
          templateParams: { petName: incident.pet.name.slice(0, 40), area: incident.publicArea?.trim().slice(0, 60) || "—" },
          entityType: "LostPetIncident",
          entityId: payload.incidentId,
          deepLink: NotificationDeepLinks.publicLostIncident(payload.incidentId),
          domainEventId,
          // In-app only: a member's text must never become an SMS or email to strangers.
          attemptSms: false,
          attemptEmail: false,
        });
      }
    });
  }

  /**
   * Abuse guards for the neighbourhood fan-out (QA review of #297): one fan-out per pet a day, at most two per
   * household and per reporting member a day, and none from an account younger than a day. Counted from the
   * notifications already sent, so the limits hold across close/reopen loops and several pets.
   */
  private async nearbyFanOutAllowed(incident: { petId: string; householdId: string; createdByUserId: string }, incidentId: string): Promise<boolean> {
    const since = new Date(Date.now() - DAY_MS);
    const reporter = await this.prisma.user.findUnique({ where: { id: incident.createdByUserId }, select: { createdAt: true } });
    if (!reporter || reporter.createdAt > since) return false;
    const recent = await this.prisma.lostPetIncident.findMany({
      where: { id: { not: incidentId }, createdAt: { gte: since }, OR: [{ petId: incident.petId }, { householdId: incident.householdId }, { createdByUserId: incident.createdByUserId }] },
      select: { id: true, petId: true, householdId: true, createdByUserId: true },
    });
    if (!recent.length) return true;
    const alerted = await this.prisma.notification.findMany({
      where: { type: NEARBY_TYPE, entityType: "LostPetIncident", entityId: { in: recent.map((r) => r.id) } },
      distinct: ["entityId"],
      select: { entityId: true },
    });
    const fannedOut = recent.filter((r) => alerted.some((a) => a.entityId === r.id));
    if (fannedOut.some((r) => r.petId === incident.petId)) return false;
    if (fannedOut.filter((r) => r.householdId === incident.householdId).length >= NEARBY_PER_REPORTER_PER_DAY) return false;
    if (fannedOut.filter((r) => r.createdByUserId === incident.createdByUserId).length >= NEARBY_PER_REPORTER_PER_DAY) return false;
    return true;
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
