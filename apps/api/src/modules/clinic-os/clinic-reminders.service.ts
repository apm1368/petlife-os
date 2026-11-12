import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { ClinicReminderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ClinicEntitlementService } from "./clinic-entitlement.service";
import { startOfUtcMonth } from "./clinic-subscription.service";
import { toReminderDto } from "./clinic-customers.service";
import { ClinicClientsService } from "./clinic-clients.service";
import type { CreateClinicReminderDto, ListClinicRemindersQueryDto } from "./dto/clinic-os.dto";

const MAX_AHEAD_MS = 366 * 86400e3;

/**
 * Clinic → owner reminders and one-off messages for the clinic's own patients. Gated by the clinic plan
 * (`clinic.reminders`, capped by `clinic.reminders.monthly.max`). Delivery is only ever the
 * NotificationOrchestrator: in-app always, plus SMS/email only where MessagingGateway has a real provider and
 * the owner's preferences allow it — nothing here pretends an SMS was sent.
 */
@Injectable()
export class ClinicRemindersService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = new Logger(ClinicRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClinicEntitlementService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly clients: ClinicClientsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") { registerWorker("clinic-reminders", 60_000); this.timer = setInterval(() => void trackWorker("clinic-reminders", 60_000, () => this.processDue()).catch((e) => this.logger.error("Clinic reminder tick failed", e)), 60_000); }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async create(ctx: ResolvedProviderContext, dto: CreateClinicReminderDto) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.reminders");
    const used = await this.prisma.clinicReminder.count({ where: { providerOrganizationId: ctx.organizationId, createdAt: { gte: startOfUtcMonth(new Date()) } } });
    await this.entitlements.assertWithinLimit(ctx.organizationId, "clinic.reminders.monthly.max", used);

    if (!!dto.petId === !!dto.contactId) throw new ValidationApiException({ field: "petId", reason: "EXACTLY_ONE_TARGET" });
    if (dto.petId) {
      // Only this clinic's own patients — the same 404 for an unknown pet and someone else's.
      const isPatient = await this.prisma.pet.count({ where: { id: dto.petId, OR: [{ bookings: { some: { providerOrganizationId: ctx.organizationId } } }, { clinicalVisits: { some: { providerOrganizationId: ctx.organizationId } } }] } });
      if (!isPatient) throw new NotFoundApiException("Pet");
    } else {
      // Only this clinic's own clients, and a client pet only of that client.
      const client = await this.prisma.clinicImportedContact.count({ where: { id: dto.contactId, providerOrganizationId: ctx.organizationId } });
      if (!client) throw new NotFoundApiException("ClinicClient");
      if (dto.clientPetId && !(await this.prisma.clinicClientPet.count({ where: { id: dto.clientPetId, contactId: dto.contactId } }))) throw new NotFoundApiException("ClinicClientPet");
      // At most 20 scheduled reminders per client: no queue of texts piling up on one phone.
      const open = await this.prisma.clinicReminder.count({ where: { contactId: dto.contactId, status: ClinicReminderStatus.SCHEDULED } });
      if (open >= 20) throw new ValidationApiException({ field: "contactId", reason: "TOO_MANY_OPEN_REMINDERS", max: 20 });
    }

    const now = new Date();
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : now;
    if (dto.dueAt && (dueAt.getTime() < now.getTime() - 60_000 || dueAt.getTime() > now.getTime() + MAX_AHEAD_MS)) throw new ValidationApiException({ dueAt: "must be between now and one year ahead" });
    const title = dto.title.trim();
    if (!title) throw new ValidationApiException({ title: "required" });

    const row = await this.prisma.clinicReminder.create({
      data: { providerOrganizationId: ctx.organizationId, petId: dto.petId ?? null, contactId: dto.contactId ?? null, clientPetId: dto.contactId ? (dto.clientPetId ?? null) : null, createdByProviderUserId: ctx.providerUserId, kind: dto.kind, title, note: dto.note?.trim() || null, dueAt },
    });
    if (dueAt <= now) await this.deliver(row.id);
    return toReminderDto(await this.prisma.clinicReminder.findUniqueOrThrow({ where: { id: row.id } }));
  }

  async list(ctx: ResolvedProviderContext, query: ListClinicRemindersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ClinicReminderWhereInput = { providerOrganizationId: ctx.organizationId, ...(query.status ? { status: query.status } : {}), ...(query.petId ? { petId: query.petId } : {}) };
    const [total, rows] = await Promise.all([this.prisma.clinicReminder.count({ where }), this.prisma.clinicReminder.findMany({ where, orderBy: { dueAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]);
    return { items: rows.map(toReminderDto), page, pageSize, total };
  }

  async cancel(ctx: ResolvedProviderContext, id: string) {
    const updated = await this.prisma.clinicReminder.updateMany({ where: { id, providerOrganizationId: ctx.organizationId, status: ClinicReminderStatus.SCHEDULED }, data: { status: ClinicReminderStatus.CANCELLED, cancelledAt: new Date() } });
    const row = await this.prisma.clinicReminder.findFirst({ where: { id, providerOrganizationId: ctx.organizationId } });
    if (!row) throw new NotFoundApiException("ClinicReminder");
    if (!updated.count && row.status !== ClinicReminderStatus.CANCELLED) throw new ValidationApiException({ status: `a ${row.status} reminder cannot be cancelled` });
    return toReminderDto(row);
  }

  /** Worker tick: sends every SCHEDULED reminder that is due. Public so tests can drive it. */
  async processDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.clinicReminder.findMany({ where: { status: ClinicReminderStatus.SCHEDULED, dueAt: { lte: new Date() } }, select: { id: true }, orderBy: { dueAt: "asc" }, take: 100 });
      let sent = 0;
      for (const r of due) if (await this.deliver(r.id)) sent++;
      return sent;
    } finally {
      this.running = false;
    }
  }

  /**
   * Claims the row (SCHEDULED → SENT) atomically so two workers can never both deliver it, then notifies every
   * owner of the pet's household. A deterministic domain-event id makes a retried delivery idempotent.
   */
  /** Delivers one due reminder now (also used by confirmed campaigns). */
  async deliver(id: string): Promise<boolean> {
    const now = new Date();
    const claimed = await this.prisma.clinicReminder.updateMany({ where: { id, status: ClinicReminderStatus.SCHEDULED, dueAt: { lte: now } }, data: { status: ClinicReminderStatus.SENT, sentAt: now } });
    if (!claimed.count) return false;
    const row = await this.prisma.clinicReminder.findUniqueOrThrow({
      where: { id },
      include: {
        pet: { select: { name: true, householdId: true, household: { select: { members: { where: { role: "OWNER" }, select: { userId: true } } } } } },
        contact: { select: { id: true, linkedUserId: true } },
        clientPet: { select: { name: true } },
        providerOrganization: { select: { name: true } },
      },
    });
    if (!row.pet || !row.petId) return this.deliverToClient(row);
    const pet = row.pet;
    const petId = row.petId;
    const owners = pet.household.members.map((m) => m.userId);
    if (!owners.length) {
      await this.prisma.clinicReminder.update({ where: { id }, data: { status: ClinicReminderStatus.FAILED, recipientCount: 0 } });
      return false;
    }
    for (const userId of owners) {
      const hex = createHash("sha256").update(`clinic-reminder:${row.id}:${userId}`).digest("hex").slice(0, 32);
      const eventId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
      await this.prisma.domainEvent.upsert({
        where: { id: eventId },
        create: { id: eventId, processedAt: new Date(), type: "ClinicReminderSent", aggregateType: "Pet", aggregateId: petId, payload: { reminderId: row.id, providerOrganizationId: row.providerOrganizationId, kind: row.kind } },
        update: {},
      });
      await this.notifications.notify({
        userId,
        type: row.kind === "MESSAGE" ? "clinic.message" : "clinic.reminder",
        category: "HEALTH",
        petId,
        householdId: pet.householdId,
        deepLink: NotificationDeepLinks.pet(petId),
        entityType: "ClinicReminder",
        entityId: row.id,
        domainEventId: eventId,
        actorType: "PROVIDER_ORGANIZATION",
        actorId: row.providerOrganizationId,
        templateParams: { clinic: row.providerOrganization.name, petName: pet.name, title: row.title },
        metadata: { kind: row.kind, note: row.note },
      });
    }
    await this.prisma.clinicReminder.update({ where: { id }, data: { recipientCount: owners.length } });
    return true;
  }

  /**
   * A reminder for one of the clinic's own clients: a text to their phone (SIMULATED while SMS is in sandbox,
   * SKIPPED without a phone or after opt-out), plus an in-app notice when they connected their opetlife account.
   */
  private async deliverToClient(row: { id: string; providerOrganizationId: string; contactId: string | null; kind: string; title: string; note: string | null; contact: { id: string; linkedUserId: string | null } | null; clientPet: { name: string } | null; providerOrganization: { name: string } }): Promise<boolean> {
    if (!row.contactId || !row.contact) {
      await this.prisma.clinicReminder.update({ where: { id: row.id }, data: { status: ClinicReminderStatus.FAILED, recipientCount: 0 } });
      return false;
    }
    const text = await this.clients.sendReminderText({ id: row.id, providerOrganizationId: row.providerOrganizationId, contactId: row.contactId, title: row.title, note: row.note, clientPetName: row.clientPet?.name ?? null });
    let recipients = text && (text.status === "SENT" || text.status === "SIMULATED") ? 1 : 0;
    if (row.contact.linkedUserId) {
      await this.notifications.notify({
        userId: row.contact.linkedUserId,
        type: row.kind === "MESSAGE" ? "clinic.message" : "clinic.reminder",
        category: "HEALTH",
        deepLink: "/notifications",
        entityType: "ClinicReminder",
        entityId: row.id,
        actorType: "PROVIDER_ORGANIZATION",
        actorId: row.providerOrganizationId,
        templateParams: { clinic: row.providerOrganization.name, petName: row.clientPet?.name ?? "", title: row.title },
        metadata: { kind: row.kind, note: row.note },
      });
      recipients = Math.max(recipients, 1);
    }
    await this.prisma.clinicReminder.update({ where: { id: row.id }, data: { recipientCount: recipients, ...(recipients ? {} : { status: ClinicReminderStatus.FAILED }) } });
    return recipients > 0;
  }
}
