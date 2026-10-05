import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { BookingStatus, CarePlanItemStatus, ClinicCampaignSegment, ClinicReminderKind, ClinicTaskStatus, Prisma, ProviderUserRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ClinicEntitlementService } from "./clinic-entitlement.service";
import { ClinicRemindersService } from "./clinic-reminders.service";
import { startOfUtcMonth } from "./clinic-subscription.service";
import { parseCsv, toCsv } from "./csv.util";
import type { AddCustomerNoteDto, AssignAppointmentDto, CreateClinicTaskDto, ImportContactsDto, ListClinicTasksQueryDto, SendCampaignDto } from "./dto/clinic-os.dto";

const DAY = 86400e3;
/** Tehran is UTC+03:30 all year (no DST since 2022). */
const tehranDayStart = (date: string) => new Date(`${date}T00:00:00+03:30`);
const tehranToday = (now = new Date()) => new Date(now.getTime() + 3.5 * 3600e3).toISOString().slice(0, 10);
const OPEN_FOR_ASSIGNMENT: BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.PENDING_CONFIRMATION, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
const QUEUE_BUCKET: Partial<Record<BookingStatus, string>> = {
  REQUESTED: "SCHEDULED", PENDING_CONFIRMATION: "SCHEDULED", AWAITING_PAYMENT: "SCHEDULED", CONFIRMED: "SCHEDULED",
  CHECKED_IN: "WAITING", IN_PROGRESS: "IN_CONSULTATION", COMPLETED: "COMPLETED", NO_SHOW: "NO_SHOW",
  CANCELLED_BY_USER: "CANCELLED", CANCELLED_BY_PROVIDER: "CANCELLED",
};
const SEGMENT_KIND: Record<ClinicCampaignSegment, ClinicReminderKind> = { APPOINTMENTS_TOMORROW: ClinicReminderKind.CHECKUP, VACCINES_DUE: ClinicReminderKind.VACCINATION, FOLLOW_UP_DUE: ClinicReminderKind.FOLLOW_UP };
const IMPORT_HEADER = ["name", "phone", "email", "petName", "species", "notes"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Clinic OS day-to-day operations, all clinic-local: CRM notes and tags on customers, the daily patient queue,
 * appointment assignment, internal tasks, confirmed reminder campaigns, CSV contact import (dry-run first, never
 * merged with PET LIFE accounts) and CSV exports. Everything is scoped to the caller's organisation; customers are
 * households already in this clinic's caseload.
 */
@Injectable()
export class ClinicOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly entitlements: ClinicEntitlementService,
    private readonly reminders: ClinicRemindersService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  // ---------------------------------------------------------------- notes

  async listNotes(ctx: ResolvedProviderContext, householdId: string) {
    await this.assertCustomer(ctx, householdId);
    const rows = await this.prisma.clinicCustomerNote.findMany({ where: { providerOrganizationId: ctx.organizationId, householdId, removedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
    const authors = await this.memberNames(rows.map((r) => r.authorProviderUserId));
    return rows.map((n) => ({ id: n.id, body: n.body, visibleToOwner: n.visibleToOwner, authorProviderUserId: n.authorProviderUserId, authorName: authors.get(n.authorProviderUserId) ?? null, createdAt: n.createdAt.toISOString() }));
  }

  async addNote(ctx: ResolvedProviderContext, householdId: string, dto: AddCustomerNoteDto) {
    await this.assertCustomer(ctx, householdId);
    const body = dto.body.trim();
    if (!body) throw new ValidationApiException({ field: "body" });
    await this.prisma.clinicCustomerNote.create({ data: { providerOrganizationId: ctx.organizationId, householdId, authorProviderUserId: ctx.providerUserId, body, visibleToOwner: dto.visibleToOwner === true } });
    return this.listNotes(ctx, householdId);
  }

  /** The author, or a clinic owner, may remove a note. */
  async removeNote(ctx: ResolvedProviderContext, householdId: string, noteId: string) {
    const note = await this.prisma.clinicCustomerNote.findFirst({ where: { id: noteId, householdId, providerOrganizationId: ctx.organizationId, removedAt: null } });
    if (!note) throw new NotFoundApiException("ClinicCustomerNote");
    if (note.authorProviderUserId !== ctx.providerUserId && ctx.role !== ProviderUserRole.OWNER) throw new PetAccessDeniedException({ reason: "NOT_NOTE_AUTHOR" });
    await this.prisma.clinicCustomerNote.update({ where: { id: note.id }, data: { removedAt: new Date() } });
    return this.listNotes(ctx, householdId);
  }

  /** Owner side: only notes a clinic explicitly shared, for households the caller belongs to. */
  async notesSharedWithMe(userId: string) {
    const rows = await this.prisma.clinicCustomerNote.findMany({
      where: { visibleToOwner: true, removedAt: null, householdId: { in: (await this.prisma.householdMember.findMany({ where: { userId }, select: { householdId: true } })).map((m) => m.householdId) } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { providerOrganization: { select: { id: true, name: true } } },
    });
    return rows.map((n) => ({ id: n.id, householdId: n.householdId, clinic: n.providerOrganization, body: n.body, createdAt: n.createdAt.toISOString() }));
  }

  // ---------------------------------------------------------------- tags

  async listTags(ctx: ResolvedProviderContext) {
    const rows = await this.prisma.clinicCustomerTag.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { name: "asc" }, include: { _count: { select: { assignments: true } } } });
    return rows.map((t) => ({ id: t.id, name: t.name, customerCount: t._count.assignments }));
  }

  async createTag(ctx: ResolvedProviderContext, name: string) {
    const clean = name.trim();
    if (!clean) throw new ValidationApiException({ field: "name" });
    try {
      await this.prisma.clinicCustomerTag.create({ data: { providerOrganizationId: ctx.organizationId, name: clean } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationApiException({ field: "name", reason: "TAG_EXISTS" });
      throw e;
    }
    return this.listTags(ctx);
  }

  async deleteTag(ctx: ResolvedProviderContext, tagId: string) {
    const done = await this.prisma.clinicCustomerTag.deleteMany({ where: { id: tagId, providerOrganizationId: ctx.organizationId } });
    if (!done.count) throw new NotFoundApiException("ClinicCustomerTag");
    return this.listTags(ctx);
  }

  async tagCustomer(ctx: ResolvedProviderContext, householdId: string, tagId: string, on: boolean) {
    await this.assertCustomer(ctx, householdId);
    if (!(await this.prisma.clinicCustomerTag.count({ where: { id: tagId, providerOrganizationId: ctx.organizationId } }))) throw new NotFoundApiException("ClinicCustomerTag");
    if (on) await this.prisma.clinicCustomerTagAssignment.upsert({ where: { tagId_householdId: { tagId, householdId } }, create: { tagId, householdId }, update: {} });
    else await this.prisma.clinicCustomerTagAssignment.deleteMany({ where: { tagId, householdId } });
    return this.customerTags(ctx.organizationId, householdId);
  }

  async customerTags(organizationId: string, householdId: string) {
    const rows = await this.prisma.clinicCustomerTagAssignment.findMany({ where: { householdId, tag: { providerOrganizationId: organizationId } }, include: { tag: true }, orderBy: { tag: { name: "asc" } } });
    return rows.map((r) => ({ id: r.tag.id, name: r.tag.name }));
  }

  // ---------------------------------------------------------------- queue & assignment

  /** The day's appointments grouped by operational state (reuses booking states; no parallel queue model). */
  async queue(ctx: ResolvedProviderContext, date?: string) {
    const day = date ?? tehranToday();
    const start = tehranDayStart(day);
    if (!Number.isFinite(start.getTime())) throw new ValidationApiException({ field: "date" });
    const rows = await this.prisma.booking.findMany({
      where: { providerOrganizationId: ctx.organizationId, startAt: { gte: start, lt: new Date(start.getTime() + DAY) }, bookingStatus: { notIn: [BookingStatus.HOLD, BookingStatus.RESCHEDULED, BookingStatus.EXPIRED, BookingStatus.REJECTED] } },
      orderBy: { startAt: "asc" },
      include: { pet: { select: { id: true, name: true, species: true } }, user: { select: { displayName: true } }, providerUser: { select: { id: true, displayTitle: true, user: { select: { displayName: true } } } }, resource: { select: { id: true, name: true } } },
    });
    const buckets: Record<string, unknown[]> = { SCHEDULED: [], WAITING: [], IN_CONSULTATION: [], COMPLETED: [], NO_SHOW: [], CANCELLED: [] };
    for (const b of rows) {
      const bucket = QUEUE_BUCKET[b.bookingStatus] ?? "SCHEDULED";
      buckets[bucket]!.push({
        bookingId: b.id, bookingNumber: b.bookingNumber, startAt: b.startAt.toISOString(), status: b.bookingStatus, serviceName: b.serviceNameSnapshot,
        pet: b.pet, ownerDisplayName: b.user.displayName, householdId: b.householdId,
        assignedTo: b.providerUser ? { providerUserId: b.providerUser.id, name: b.providerUser.user.displayName, title: b.providerUser.displayTitle } : null,
        resource: b.resource,
      });
    }
    return { date: day, counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])), buckets };
  }

  async assign(ctx: ResolvedProviderContext, bookingId: string, dto: AssignAppointmentDto) {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, providerOrganizationId: ctx.organizationId } });
    if (!booking) throw new NotFoundApiException("Booking");
    if (!OPEN_FOR_ASSIGNMENT.includes(booking.bookingStatus)) throw new ValidationApiException({ field: "bookingId", reason: "BOOKING_NOT_ASSIGNABLE", status: booking.bookingStatus });
    const data: Prisma.BookingUncheckedUpdateInput = {};
    if (dto.providerUserId !== undefined) {
      if (dto.providerUserId !== null) {
        const member = await this.prisma.providerUser.findFirst({ where: { id: dto.providerUserId, providerOrganizationId: ctx.organizationId, removedAt: null } });
        if (!member) throw new NotFoundApiException("Team member");
        const clash = await this.prisma.booking.count({ where: { id: { not: booking.id }, providerUserId: member.id, bookingStatus: { in: OPEN_FOR_ASSIGNMENT }, startAt: { lt: booking.endAt }, endAt: { gt: booking.startAt } } });
        if (clash) throw new ValidationApiException({ field: "providerUserId", reason: "STAFF_DOUBLE_BOOKED" });
      }
      data.providerUserId = dto.providerUserId;
    }
    if (dto.resourceId !== undefined) {
      if (dto.resourceId !== null) {
        const resource = await this.prisma.providerResource.findFirst({ where: { id: dto.resourceId, providerOrganizationId: ctx.organizationId, isActive: true } });
        if (!resource) throw new NotFoundApiException("Resource");
        const clash = await this.prisma.booking.count({ where: { id: { not: booking.id }, resourceId: resource.id, bookingStatus: { in: OPEN_FOR_ASSIGNMENT }, startAt: { lt: booking.endAt }, endAt: { gt: booking.startAt } } });
        if (clash) throw new ValidationApiException({ field: "resourceId", reason: "RESOURCE_DOUBLE_BOOKED" });
      }
      data.resourceId = dto.resourceId;
    }
    await this.prisma.booking.update({ where: { id: booking.id }, data });
    await this.events.publish("ClinicAppointmentAssigned", { bookingId, providerUserId: dto.providerUserId ?? null, resourceId: dto.resourceId ?? null, actorProviderUserId: ctx.providerUserId }, { aggregateType: "Booking", aggregateId: bookingId });
    if (dto.providerUserId && dto.providerUserId !== ctx.providerUserId) {
      const member = await this.prisma.providerUser.findUniqueOrThrow({ where: { id: dto.providerUserId }, select: { userId: true } });
      await this.notifications.notify({ userId: member.userId, type: "clinic.appointment_assigned", category: "BOOKING", deepLink: NotificationDeepLinks.providerBooking(bookingId), entityType: "Booking", entityId: bookingId, templateParams: { service: booking.serviceNameSnapshot ?? "" } });
    }
    return (await this.queue(ctx, tehranToday(booking.startAt))).buckets;
  }

  // ---------------------------------------------------------------- tasks

  async listTasks(ctx: ResolvedProviderContext, query: ListClinicTasksQueryDto) {
    const rows = await this.prisma.clinicTask.findMany({
      where: { providerOrganizationId: ctx.organizationId, status: query.status ?? ClinicTaskStatus.OPEN, ...(query.mine === "true" ? { assigneeProviderUserId: ctx.providerUserId } : {}) },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 200,
    });
    return rows.map((t) => ({ id: t.id, type: t.type, title: t.title, status: t.status, dueAt: t.dueAt?.toISOString() ?? null, assigneeProviderUserId: t.assigneeProviderUserId, householdId: t.householdId, bookingId: t.bookingId, completedAt: t.completedAt?.toISOString() ?? null, overdue: t.status === ClinicTaskStatus.OPEN && t.dueAt !== null && t.dueAt < new Date() }));
  }

  async createTask(ctx: ResolvedProviderContext, dto: CreateClinicTaskDto) {
    if (dto.assigneeProviderUserId && !(await this.prisma.providerUser.count({ where: { id: dto.assigneeProviderUserId, providerOrganizationId: ctx.organizationId, removedAt: null } }))) throw new NotFoundApiException("Team member");
    if (dto.householdId) await this.assertCustomer(ctx, dto.householdId);
    if (dto.bookingId && !(await this.prisma.booking.count({ where: { id: dto.bookingId, providerOrganizationId: ctx.organizationId } }))) throw new NotFoundApiException("Booking");
    const title = dto.title.trim();
    if (!title) throw new ValidationApiException({ field: "title" });
    await this.prisma.clinicTask.create({ data: { providerOrganizationId: ctx.organizationId, type: dto.type, title, dueAt: dto.dueAt ? new Date(dto.dueAt) : null, assigneeProviderUserId: dto.assigneeProviderUserId ?? null, householdId: dto.householdId ?? null, bookingId: dto.bookingId ?? null, createdByProviderUserId: ctx.providerUserId } });
    return this.listTasks(ctx, {});
  }

  async setTaskStatus(ctx: ResolvedProviderContext, taskId: string, status: "DONE" | "CANCELLED") {
    const done = await this.prisma.clinicTask.updateMany({
      where: { id: taskId, providerOrganizationId: ctx.organizationId, status: ClinicTaskStatus.OPEN },
      data: { status, ...(status === "DONE" ? { completedAt: new Date(), completedByProviderUserId: ctx.providerUserId } : {}) },
    });
    if (!done.count) {
      if (!(await this.prisma.clinicTask.count({ where: { id: taskId, providerOrganizationId: ctx.organizationId } }))) throw new NotFoundApiException("ClinicTask");
      throw new ValidationApiException({ field: "status", reason: "TASK_NOT_OPEN" });
    }
    return this.listTasks(ctx, {});
  }

  // ---------------------------------------------------------------- campaigns

  async previewCampaign(ctx: ResolvedProviderContext, segment: ClinicCampaignSegment) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.bulk_reminders");
    const targets = await this.segmentTargets(ctx.organizationId, segment);
    const sent = await this.prisma.clinicCampaign.findUnique({ where: { providerOrganizationId_segment_dayKey: { providerOrganizationId: ctx.organizationId, segment, dayKey: tehranToday() } } });
    return { segment, count: targets.length, alreadySentToday: Boolean(sent), sample: targets.slice(0, 20).map((t) => ({ petId: t.petId, petName: t.petName, detail: t.detail })) };
  }

  /** Sends only after explicit confirmation of the current audience size; at most once per segment per day. */
  async sendCampaign(ctx: ResolvedProviderContext, dto: SendCampaignDto) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.bulk_reminders");
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.reminders");
    const targets = await this.segmentTargets(ctx.organizationId, dto.segment);
    if (targets.length !== dto.expectedCount) throw new ValidationApiException({ field: "expectedCount", reason: "AUDIENCE_CHANGED", current: targets.length });
    const usedThisMonth = await this.prisma.clinicReminder.count({ where: { providerOrganizationId: ctx.organizationId, createdAt: { gte: startOfUtcMonth(new Date()) } } });
    const cap = (await this.entitlements.resolve(ctx.organizationId)).entitlements["clinic.reminders.monthly.max"]?.limit ?? null;
    if (cap !== null && usedThisMonth + targets.length > cap) throw new ValidationApiException({ field: "expectedCount", reason: "MONTHLY_REMINDER_CAP", cap, used: usedThisMonth });
    const now = new Date();
    let campaignId: string;
    let reminderIds: string[] = [];
    try {
      [campaignId, reminderIds] = await this.prisma.$transaction(async (tx) => {
        const c = await tx.clinicCampaign.create({ data: { providerOrganizationId: ctx.organizationId, segment: dto.segment, dayKey: tehranToday(now), title: dto.title.trim(), recipientCount: targets.length, createdByProviderUserId: ctx.providerUserId } });
        const ids: string[] = [];
        for (const t of targets) {
          const r = await tx.clinicReminder.create({ data: { providerOrganizationId: ctx.organizationId, petId: t.petId, createdByProviderUserId: ctx.providerUserId, kind: SEGMENT_KIND[dto.segment], title: dto.title.trim(), note: dto.note?.trim() || null, dueAt: now } });
          ids.push(r.id);
        }
        await this.events.publish("ClinicCampaignSent", { providerOrganizationId: ctx.organizationId, campaignId: c.id, segment: dto.segment, recipientCount: targets.length, actorProviderUserId: ctx.providerUserId }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId, tx });
        return [c.id, ids] as [string, string[]];
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationApiException({ field: "segment", reason: "ALREADY_SENT_TODAY" });
      throw e;
    }
    let delivered = 0;
    for (const id of reminderIds) if (await this.reminders.deliver(id)) delivered++;
    return { campaignId, segment: dto.segment, recipientCount: targets.length, delivered };
  }

  private async segmentTargets(organizationId: string, segment: ClinicCampaignSegment): Promise<{ petId: string; petName: string; detail: string }[]> {
    const caseload: Prisma.PetWhereInput = { OR: [{ bookings: { some: { providerOrganizationId: organizationId } } }, { clinicalVisits: { some: { providerOrganizationId: organizationId } } }], lifecycleStatus: "ACTIVE" };
    if (segment === ClinicCampaignSegment.APPOINTMENTS_TOMORROW) {
      const start = tehranDayStart(tehranToday(new Date(Date.now() + DAY)));
      const rows = await this.prisma.booking.findMany({ where: { providerOrganizationId: organizationId, bookingStatus: BookingStatus.CONFIRMED, startAt: { gte: start, lt: new Date(start.getTime() + DAY) } }, include: { pet: { select: { id: true, name: true } } }, orderBy: { startAt: "asc" } });
      const seen = new Set<string>();
      return rows.filter((b) => !seen.has(b.petId) && seen.add(b.petId)).map((b) => ({ petId: b.petId, petName: b.pet.name, detail: b.startAt.toISOString() }));
    }
    if (segment === ClinicCampaignSegment.VACCINES_DUE) {
      const today = new Date(`${tehranToday()}T00:00:00Z`);
      const rows = await this.prisma.pet.findMany({ where: { ...caseload, vaccinationSummary: { nextDueDate: { gte: today, lte: new Date(today.getTime() + 14 * DAY) } } }, select: { id: true, name: true, vaccinationSummary: { select: { nextDueDate: true } } } });
      return rows.map((p) => ({ petId: p.id, petName: p.name, detail: p.vaccinationSummary!.nextDueDate!.toISOString().slice(0, 10) }));
    }
    const rows = await this.prisma.carePlanItem.findMany({ where: { status: CarePlanItemStatus.PENDING, dueAt: { gte: new Date(), lte: new Date(Date.now() + 7 * DAY) }, carePlan: { providerOrganizationId: organizationId, pet: { lifecycleStatus: "ACTIVE" } } }, include: { carePlan: { select: { petId: true, pet: { select: { name: true } } } } }, orderBy: { dueAt: "asc" } });
    const seen = new Set<string>();
    return rows.filter((i) => !seen.has(i.carePlan.petId) && seen.add(i.carePlan.petId)).map((i) => ({ petId: i.carePlan.petId, petName: i.carePlan.pet.name, detail: i.title }));
  }

  // ---------------------------------------------------------------- import

  /**
   * Validates (dry run) or imports clinic contacts from CSV. Duplicates — inside the file or against contacts the
   * clinic already imported — are reported and skipped, never merged. Nothing is matched against PET LIFE accounts.
   */
  async importContacts(ctx: ResolvedProviderContext, dto: ImportContactsDto) {
    const rows = parseCsv(dto.csv.replace(/^\uFEFF/, ""));
    if (!rows.length) throw new ValidationApiException({ field: "csv", reason: "EMPTY" });
    const header = rows[0]!.map((h) => h.trim());
    const index = Object.fromEntries(IMPORT_HEADER.map((h) => [h, header.indexOf(h)]));
    if (index.name! < 0) throw new ValidationApiException({ field: "csv", reason: "HEADER_NEEDS_NAME", expected: IMPORT_HEADER });
    const data = rows.slice(1);
    if (data.length > 1000) throw new ValidationApiException({ field: "csv", reason: "TOO_MANY_ROWS", max: 1000 });
    const existing = await this.prisma.clinicImportedContact.findMany({ where: { providerOrganizationId: ctx.organizationId }, select: { phone: true, email: true } });
    const knownPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
    const knownEmails = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean));
    const filePhones = new Set<string>();
    const fileEmails = new Set<string>();
    const errors: { row: number; field: string; reason: string }[] = [];
    const duplicates: { row: number; matches: "FILE" | "EXISTING"; field: "phone" | "email" }[] = [];
    const valid: { name: string; phone: string | null; email: string | null; petName: string | null; species: string | null; notes: string | null }[] = [];
    data.forEach((cells, i) => {
      const rowNo = i + 2;
      const get = (k: (typeof IMPORT_HEADER)[number]) => (index[k]! >= 0 ? (cells[index[k]!] ?? "").trim() : "");
      const name = get("name");
      const phone = get("phone").replace(/[\s\-()]/g, "") || null;
      const email = get("email").toLowerCase() || null;
      const rowErrors: { row: number; field: string; reason: string }[] = [];
      if (!name || name.length > 120) rowErrors.push({ row: rowNo, field: "name", reason: "REQUIRED_MAX_120" });
      if (!phone && !email) rowErrors.push({ row: rowNo, field: "phone", reason: "PHONE_OR_EMAIL_REQUIRED" });
      if (phone && !/^\+?\d{7,15}$/.test(phone)) rowErrors.push({ row: rowNo, field: "phone", reason: "INVALID" });
      if (email && !EMAIL.test(email)) rowErrors.push({ row: rowNo, field: "email", reason: "INVALID" });
      if (get("notes").length > 500) rowErrors.push({ row: rowNo, field: "notes", reason: "MAX_500" });
      if (rowErrors.length) return void errors.push(...rowErrors);
      const dup = phone && knownPhones.has(phone) ? { matches: "EXISTING" as const, field: "phone" as const } : email && knownEmails.has(email) ? { matches: "EXISTING" as const, field: "email" as const } : phone && filePhones.has(phone) ? { matches: "FILE" as const, field: "phone" as const } : email && fileEmails.has(email) ? { matches: "FILE" as const, field: "email" as const } : null;
      if (dup) return void duplicates.push({ row: rowNo, ...dup });
      if (phone) filePhones.add(phone);
      if (email) fileEmails.add(email);
      valid.push({ name, phone, email, petName: get("petName").slice(0, 80) || null, species: get("species").slice(0, 40) || null, notes: get("notes") || null });
    });
    const summary = { totalRows: data.length, validRows: valid.length, errors, duplicates };
    if (dto.dryRun !== false) return { dryRun: true, ...summary, imported: 0 };
    const batchId = randomUUID();
    const created = await this.prisma.clinicImportedContact.createMany({ data: valid.map((v) => ({ ...v, providerOrganizationId: ctx.organizationId, importBatchId: batchId })), skipDuplicates: true });
    await this.events.publish("ClinicContactsImported", { providerOrganizationId: ctx.organizationId, batchId, imported: created.count, actorProviderUserId: ctx.providerUserId }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId });
    return { dryRun: false, ...summary, imported: created.count, batchId };
  }

  async listContacts(ctx: ResolvedProviderContext, q?: string) {
    const rows = await this.prisma.clinicImportedContact.findMany({
      where: { providerOrganizationId: ctx.organizationId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { petName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}) },
      orderBy: { name: "asc" },
      take: 200,
    });
    return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, petName: c.petName, species: c.species, notes: c.notes, createdAt: c.createdAt.toISOString() }));
  }

  // ---------------------------------------------------------------- exports

  /** Owner-only, plan-gated, recorded as a domain event. Cells are formula-safe. */
  async exportCsv(ctx: ResolvedProviderContext, kind: "customers" | "appointments" | "services" | "contacts") {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.exports");
    let csv: string;
    if (kind === "services") {
      const rows = await this.prisma.providerService.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { name: "asc" } });
      csv = toCsv(["name", "category", "durationMinutes", "priceAmount", "currency", "dogs", "cats", "active"], rows.map((s) => [s.name, s.category, s.durationMinutes, s.priceAmount?.toString() ?? "", s.currency ?? "", s.supportsDog, s.supportsCat, s.isActive]));
    } else if (kind === "appointments") {
      const rows = await this.prisma.booking.findMany({ where: { providerOrganizationId: ctx.organizationId, startAt: { gte: new Date(Date.now() - 366 * DAY) } }, orderBy: { startAt: "desc" }, take: 5000, include: { pet: { select: { name: true } }, providerUser: { select: { user: { select: { displayName: true } } } } } });
      csv = toCsv(["bookingNumber", "startAt", "status", "service", "pet", "assignedTo", "amount", "currency", "paymentMode"], rows.map((b) => [b.bookingNumber, b.startAt.toISOString(), b.bookingStatus, b.serviceNameSnapshot, b.pet.name, b.providerUser?.user.displayName ?? "", b.priceAmount ? b.priceAmount.minus(b.discountAmount).toString() : "", b.currency ?? "", b.paymentMode]));
    } else if (kind === "contacts") {
      csv = toCsv([...IMPORT_HEADER], (await this.listContacts(ctx)).map((c) => [c.name, c.phone, c.email, c.petName, c.species, c.notes]));
    } else {
      const households = await this.prisma.household.findMany({
        where: { pets: { some: { OR: [{ bookings: { some: { providerOrganizationId: ctx.organizationId } } }, { clinicalVisits: { some: { providerOrganizationId: ctx.organizationId } } }] } } },
        take: 5000,
        select: { id: true, members: { where: { role: "OWNER" }, take: 1, select: { user: { select: { displayName: true } } } }, pets: { where: { OR: [{ bookings: { some: { providerOrganizationId: ctx.organizationId } } }, { clinicalVisits: { some: { providerOrganizationId: ctx.organizationId } } }] }, select: { name: true } } },
      });
      const tags = await this.prisma.clinicCustomerTagAssignment.findMany({ where: { tag: { providerOrganizationId: ctx.organizationId } }, include: { tag: { select: { name: true } } } });
      const byHousehold = new Map<string, string[]>();
      for (const t of tags) byHousehold.set(t.householdId, [...(byHousehold.get(t.householdId) ?? []), t.tag.name]);
      // Platform customers' contact details are never exported — only what this clinic sees in its registry.
      csv = toCsv(["householdId", "ownerDisplayName", "pets", "tags"], households.map((h) => [h.id, h.members[0]?.user.displayName ?? "", h.pets.map((p) => p.name), byHousehold.get(h.id) ?? []]));
    }
    await this.events.publish("ClinicExportGenerated", { providerOrganizationId: ctx.organizationId, kind, actorProviderUserId: ctx.providerUserId }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId });
    return { filename: `clinic-${kind}-${tehranToday()}.csv`, contentType: "text/csv", csv };
  }

  // ---------------------------------------------------------------- helpers

  /** A household is this clinic's customer when one of its pets was booked or seen here. Same 404 otherwise. */
  private async assertCustomer(ctx: ResolvedProviderContext, householdId: string) {
    const ok = await this.prisma.household.count({ where: { id: householdId, pets: { some: { OR: [{ bookings: { some: { providerOrganizationId: ctx.organizationId } } }, { clinicalVisits: { some: { providerOrganizationId: ctx.organizationId } } }] } } } });
    if (!ok) throw new NotFoundApiException("ClinicCustomer");
  }

  private async memberNames(ids: string[]) {
    const rows = ids.length ? await this.prisma.providerUser.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, user: { select: { displayName: true } } } }) : [];
    return new Map(rows.map((r) => [r.id, r.user.displayName]));
  }
}
