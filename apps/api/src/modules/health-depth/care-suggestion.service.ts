import { Injectable } from "@nestjs/common";
import { CareSuggestionStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { CareReminderService } from "../care-reminders/care-reminder.service";
import { CARE_TYPES } from "../care-reminders/care-time";

export interface CareSuggestionInput {
  title: string;
  type: string;
  suggestedDueAt: string;
  recurrence?: string;
  intervalDays?: number;
  notes?: string;
}

/**
 * Cross-domain chain #1 (and the care step of #2): a clinic attaches care instructions to a completed visit or
 * booking → the owner is notified → the owner accepts (a normal CareReminder is created, entitlements apply) or
 * dismisses. Nothing becomes a reminder without the owner's confirmation; accept is claimed atomically so a double
 * tap can't create two reminders.
 */
@Injectable()
export class CareSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly care: CareReminderService,
  ) {}

  /** Provider side: only for a completed visit/booking of the caller's own organisation. */
  async createForSource(organizationId: string, providerUserId: string, source: { visitId?: string; bookingId?: string }, items: CareSuggestionInput[]) {
    let petId: string;
    if (source.visitId) {
      const visit = await this.prisma.clinicalVisit.findFirst({ where: { id: source.visitId, providerOrganizationId: organizationId } });
      if (!visit) throw new NotFoundApiException("ClinicalVisit");
      if (visit.status !== "COMPLETED") throw new ValidationApiException({ field: "visitId", reason: "VISIT_NOT_COMPLETED" });
      petId = visit.petId;
    } else {
      const booking = await this.prisma.booking.findFirst({ where: { id: source.bookingId, providerOrganizationId: organizationId } });
      if (!booking) throw new NotFoundApiException("Booking");
      if (booking.bookingStatus !== "COMPLETED") throw new ValidationApiException({ field: "bookingId", reason: "BOOKING_NOT_COMPLETED" });
      petId = booking.petId;
    }
    for (const i of items) {
      if (!(CARE_TYPES as readonly string[]).includes(i.type)) throw new ValidationApiException({ field: "type" });
      if (!i.title.trim()) throw new ValidationApiException({ field: "title" });
    }
    const rows = await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const i of items) {
        const row = await tx.careSuggestion.create({ data: { petId, providerOrganizationId: organizationId, createdByProviderUserId: providerUserId, clinicalVisitId: source.visitId ?? null, bookingId: source.bookingId ?? null, title: i.title.trim(), type: i.type, notes: i.notes?.trim() || null, suggestedDueAt: new Date(i.suggestedDueAt), recurrence: i.recurrence ?? null, intervalDays: i.intervalDays ?? null } });
        created.push(row);
      }
      await this.events.publish("CareSuggestionCreated", { petId, suggestionIds: created.map((c) => c.id), providerOrganizationId: organizationId, clinicalVisitId: source.visitId ?? null, bookingId: source.bookingId ?? null }, { tx, aggregateType: "Pet", aggregateId: petId });
      return created;
    });
    const [pet, org] = await Promise.all([
      this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { name: true, householdId: true } }),
      this.prisma.providerOrganization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } }),
    ]);
    const viewers = await this.prisma.petAccessGrant.findMany({ where: { petId, revokedAt: null, canViewCareProfile: true, user: { householdMemberships: { some: { householdId: pet.householdId } } } }, select: { userId: true } });
    for (const userId of [...new Set(viewers.map((v) => v.userId))]) {
      await this.notifications.notify({ userId, type: "care.suggestion_received", category: "HEALTH", deepLink: `/pets/${petId}/care`, entityType: "CareSuggestion", entityId: rows[0]!.id, templateParams: { petName: pet.name, clinic: org.name } });
    }
    return rows.map(toDto);
  }

  async list(petId: string, status?: CareSuggestionStatus) {
    const rows = await this.prisma.careSuggestion.findMany({ where: { petId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
    const orgs = await this.prisma.providerOrganization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.providerOrganizationId))] } }, select: { id: true, name: true } });
    return rows.map((r) => ({ ...toDto(r), organization: orgs.find((o) => o.id === r.providerOrganizationId) ?? null }));
  }

  async accept(petId: string, suggestionId: string, userId: string, overrides: { dueAt?: string; assignedToUserId?: string | null }) {
    const claimed = await this.prisma.careSuggestion.updateMany({ where: { id: suggestionId, petId, status: CareSuggestionStatus.PENDING }, data: { status: CareSuggestionStatus.ACCEPTED, decidedByUserId: userId, decidedAt: new Date() } });
    if (!claimed.count) throw await this.notPending(petId, suggestionId);
    const s = await this.prisma.careSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    try {
      const reminder = await this.care.create(petId, userId, { title: s.title, type: s.type, dueAt: overrides.dueAt ?? s.suggestedDueAt.toISOString(), recurrence: s.recurrence ?? undefined, intervalDays: s.intervalDays ?? undefined, assignedToUserId: overrides.assignedToUserId ?? undefined });
      await this.prisma.careSuggestion.update({ where: { id: suggestionId }, data: { careReminderId: reminder.id } });
      await this.events.publish("CareSuggestionAccepted", { petId, suggestionId, careItemId: reminder.id, actorUserId: userId }, { aggregateType: "Pet", aggregateId: petId });
      return { ...toDto({ ...s, careReminderId: reminder.id }), careReminder: reminder };
    } catch (error) {
      // e.g. the household's plan doesn't include personal reminders: undo the claim so it can be accepted later.
      await this.prisma.careSuggestion.update({ where: { id: suggestionId }, data: { status: CareSuggestionStatus.PENDING, decidedByUserId: null, decidedAt: null } });
      throw error;
    }
  }

  async dismiss(petId: string, suggestionId: string, userId: string) {
    const done = await this.prisma.careSuggestion.updateMany({ where: { id: suggestionId, petId, status: CareSuggestionStatus.PENDING }, data: { status: CareSuggestionStatus.DISMISSED, decidedByUserId: userId, decidedAt: new Date() } });
    if (!done.count) throw await this.notPending(petId, suggestionId);
    return toDto(await this.prisma.careSuggestion.findUniqueOrThrow({ where: { id: suggestionId } }));
  }

  private async notPending(petId: string, suggestionId: string) {
    const row = await this.prisma.careSuggestion.findFirst({ where: { id: suggestionId, petId } });
    return row ? new ValidationApiException({ field: "suggestionId", reason: "ALREADY_DECIDED", status: row.status }) : new NotFoundApiException("CareSuggestion");
  }
}

function toDto(r: { id: string; petId: string; title: string; type: string; notes: string | null; suggestedDueAt: Date; recurrence: string | null; intervalDays: number | null; status: CareSuggestionStatus; clinicalVisitId: string | null; bookingId: string | null; careReminderId: string | null; decidedAt: Date | null; createdAt: Date }) {
  return { id: r.id, petId: r.petId, title: r.title, type: r.type, notes: r.notes, suggestedDueAt: r.suggestedDueAt.toISOString(), recurrence: r.recurrence, intervalDays: r.intervalDays, status: r.status, source: r.clinicalVisitId ? { kind: "VISIT", id: r.clinicalVisitId } : { kind: "BOOKING", id: r.bookingId }, careReminderId: r.careReminderId, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() };
}
