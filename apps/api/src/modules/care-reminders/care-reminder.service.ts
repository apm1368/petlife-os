import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import { CLOSED_CARE_STATES, nextOccurrence, visibleCareState } from "./care-time";
import { CARE_TEMPLATES } from "./care-templates";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { EntitlementService } from "../subscriptions/entitlement.service";
import type { ApplyCareTemplateDto, CareHistoryQueryDto, CreateReminderDto, EditReminderDto, ReminderActionDto } from "./care-reminder.dto";

@Injectable()
export class CareReminderService {
  constructor(private readonly prisma: PrismaService, private readonly access: PetAccessService, private readonly entitlements: EntitlementService, private readonly notifications: NotificationOrchestratorService) {}

  async list(petId: string, userId: string) {
    const health = (await this.access.getEffectivePermissions(petId, userId))?.canViewHealth;
    const rows = await this.prisma.careReminder.findMany({ where: { petId }, orderBy: { dueAt: "asc" }, take: 500 });
    return rows.filter(row => health || row.source === "USER_CREATED").map(row => ({ ...row, state: visibleCareState(row) }));
  }
  async get(petId: string, id: string, userId: string) {
    const row = await this.prisma.careReminder.findFirst({ where: { id, petId } });
    if (!row) throw new NotFoundApiException("Care item");
    if (row.source !== "USER_CREATED" && !(await this.access.getEffectivePermissions(petId, userId))?.canViewHealth) throw new PetAccessDeniedException();
    return { ...row, state: visibleCareState(row) };
  }
  /** Closed care (completed, skipped, cancelled), newest first, with who completed it. */
  async history(petId: string, userId: string, query: CareHistoryQueryDto) {
    const health = (await this.access.getEffectivePermissions(petId, userId))?.canViewHealth;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = { petId, state: { in: [...CLOSED_CARE_STATES] }, ...(health ? {} : { source: "USER_CREATED" }) };
    const [total, rows] = await Promise.all([
      this.prisma.careReminder.count({ where }),
      this.prisma.careReminder.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const people = await this.displayNames(rows.flatMap((r) => [r.completedByUserId, r.assignedToUserId]));
    return { items: rows.map((r) => ({ ...r, state: visibleCareState(r), completedByDisplayName: r.completedByUserId ? people.get(r.completedByUserId) ?? null : null, assignedToDisplayName: r.assignedToUserId ? people.get(r.assignedToUserId) ?? null : null })), page, pageSize, total };
  }

  templates(locale: string) {
    const l = locale === "en" ? "en" : "fa";
    return CARE_TEMPLATES.map((t) => ({ key: t.key, title: t.title[l], description: t.description[l], items: t.items.map((i) => ({ key: i.key, type: i.type, title: i.title[l], recurrence: i.recurrence, intervalDays: i.intervalDays ?? null, weekdays: i.weekdays ?? [], offsetDays: i.offsetDays, confirmWithVet: i.confirmWithVet })) }));
  }

  /** Creates exactly the confirmed template items, in one transaction. Unknown keys are refused, not ignored. */
  async applyTemplate(petId: string, userId: string, locale: string, dto: ApplyCareTemplateDto) {
    const template = CARE_TEMPLATES.find((t) => t.key === dto.templateKey);
    if (!template) throw new NotFoundApiException("CareTemplate");
    if (!dto.items.length) throw new ValidationApiException({ field: "items", reason: "CONFIRM_AT_LEAST_ONE" });
    const start = new Date(dto.startAt);
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(dto.startAt) || !Number.isFinite(start.getTime())) throw new ValidationApiException({ field: "startAt", reason: "Timestamp must include a timezone." });
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
    await this.entitlements.assertFeature(pet.householdId, "care.reminders");
    const l = locale === "en" ? "en" : "fa";
    const planned = dto.items.map((c) => {
      const item = template.items.find((i) => i.key === c.key);
      if (!item) throw new ValidationApiException({ field: "items", reason: "UNKNOWN_ITEM", key: c.key });
      const recurrence = c.recurrence ?? item.recurrence;
      const intervalDays = c.intervalDays ?? item.intervalDays ?? null;
      if (recurrence === "CUSTOM" && !intervalDays) throw new ValidationApiException({ field: "intervalDays", key: c.key });
      if (recurrence === "WEEKDAYS" && !(item.weekdays ?? []).length) throw new ValidationApiException({ field: "recurrence", key: c.key });
      const dueAt = new Date(start.getTime() + item.offsetDays * 86400e3);
      return { title: (c.title ?? item.title[l]).trim(), type: item.type, recurrence, intervalDays, weekdays: recurrence === "WEEKDAYS" ? item.weekdays ?? [] : [], maxOccurrences: c.maxOccurrences ?? null, dueAt };
    });
    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const p of planned) {
        const row = await tx.careReminder.create({ data: { petId, createdByUserId: userId, title: p.title, type: p.type, dueAt: p.dueAt, originalDueAt: p.dueAt, recurrence: p.recurrence, intervalDays: p.intervalDays, weekdays: p.weekdays, maxOccurrences: p.maxOccurrences } });
        created.push({ ...row, state: visibleCareState(row) });
      }
      await tx.domainEvent.create({ data: { type: "CareTemplateApplied", aggregateType: "Pet", aggregateId: petId, payload: { petId, actorUserId: userId, templateKey: template.key, careItemIds: created.map((c) => c.id) } } });
      return created;
    });
  }

  async create(petId: string, userId: string, dto: CreateReminderDto) {
    this.validate(dto);
    await this.assertAssignable(petId, dto.assignedToUserId);
    // Personal reminders are a plan feature (care.reminders). Reminders the record derives (vaccines due…)
    // are never gated, and existing reminders stay readable and actionable after a downgrade.
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
    await this.entitlements.assertFeature(pet.householdId, "care.reminders");
    return this.prisma.$transaction(async tx => {
      const row = await tx.careReminder.create({ data: { petId, createdByUserId: userId, title: dto.title.trim(), type: dto.type, dueAt: new Date(dto.dueAt), originalDueAt: new Date(dto.dueAt), recurrence: dto.recurrence ?? "ONCE", intervalDays: dto.intervalDays, weekdays: dto.weekdays ?? [], untilDate: dto.untilDate ? new Date(dto.untilDate) : null, maxOccurrences: dto.maxOccurrences ?? null, assignedToUserId: dto.assignedToUserId ?? null } });
      await tx.domainEvent.create({ data: { type: "CareReminderCreated", aggregateType: "Pet", aggregateId: petId, payload: { petId, careItemId: row.id, actorUserId: userId } } });
      return { ...row, state: visibleCareState(row) };
    }).then(async (row) => {
      await this.notifyAssignee(petId, row.id, row.title, row.assignedToUserId, userId);
      return row;
    });
  }
  async edit(petId: string, id: string, userId: string, dto: EditReminderDto) {
    const row = await this.get(petId, id, userId);
    this.assertOpen(row.state);
    if (row.source !== "USER_CREATED") throw new ValidationApiException({ reason: "Source-authored care cannot be edited; adjust its reminder time instead." });
    this.validate({ ...row, ...dto, dueAt: dto.dueAt ?? row.dueAt.toISOString(), intervalDays: dto.intervalDays ?? row.intervalDays ?? undefined, weekdays: dto.weekdays ?? row.weekdays, untilDate: dto.untilDate ?? row.untilDate?.toISOString() });
    await this.assertAssignable(petId, dto.assignedToUserId);
    const result = await this.prisma.$transaction(async tx => {
      const updated = await tx.careReminder.updateMany({ where: { id, petId, version: row.version }, data: { ...dto, untilDate: dto.untilDate ? new Date(dto.untilDate) : undefined, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, notifiedAt: dto.dueAt ? null : undefined, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ValidationApiException({ reason: "Care item changed; reload before editing." });
      await tx.domainEvent.create({ data: { type: "CareReminderEdited", aggregateType: "Pet", aggregateId: petId, payload: { petId, careItemId: id, actorUserId: userId } } });
      const saved = await tx.careReminder.findUniqueOrThrow({ where: { id } });
      return { ...saved, state: visibleCareState(saved) };
    });
    if (dto.assignedToUserId && dto.assignedToUserId !== row.assignedToUserId) await this.notifyAssignee(petId, id, result.title, dto.assignedToUserId, userId);
    return result;
  }
  async act(petId: string, id: string, userId: string, dto: ReminderActionDto) {
    const row = await this.get(petId, id, userId);
    this.assertOpen(row.state);
    const now = new Date();
    const at = dto.at ? new Date(dto.at) : null;
    if ((dto.action === "SNOOZE" || dto.action === "RESCHEDULE") && (!at || at <= now || !/(Z|[+-]\d{2}:\d{2})$/.test(dto.at!))) throw new ValidationApiException({ field: "at", reason: "Choose a future time including its timezone." });
    return this.prisma.$transaction(async tx => {
      const data = dto.action === "COMPLETE" ? { state: "COMPLETED", completedAt: now, completedByUserId: userId } : dto.action === "SKIP" ? { state: "SKIPPED", skippedAt: now, completedByUserId: userId } : dto.action === "CANCEL" ? { state: "CANCELLED", cancelledAt: now } : dto.action === "SNOOZE" ? { snoozedUntil: at, notifiedAt: null } : { dueAt: at!, snoozedUntil: null, notifiedAt: null };
      const updated = await tx.careReminder.updateMany({ where: { id, petId, version: row.version }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ValidationApiException({ reason: "Care item changed; reload before acting." });
      await tx.domainEvent.create({ data: { type: dto.action === "COMPLETE" ? "CareReminderCompleted" : dto.action === "SKIP" ? "CareReminderSkipped" : "CareReminderChanged", aggregateType: "Pet", aggregateId: petId, payload: { petId, careItemId: id, actorUserId: userId, action: dto.action, originalDueAt: row.originalDueAt.toISOString(), at: dto.at ?? null } } });
      // Completing or skipping one occurrence schedules the next, unless the series has ended.
      if (dto.action === "COMPLETE" || dto.action === "SKIP") {
        const next = nextOccurrence(row);
        if (next) await tx.careReminder.create({ data: { petId, createdByUserId: row.createdByUserId, title: row.title, type: row.type, source: row.source, sourceId: row.sourceId, parentId: row.id, originalDueAt: next, dueAt: next, recurrence: row.recurrence, intervalDays: row.intervalDays, weekdays: row.weekdays, untilDate: row.untilDate, maxOccurrences: row.maxOccurrences, occurrenceIndex: row.occurrenceIndex + 1, assignedToUserId: row.assignedToUserId } });
      }
      // Responses carry the state the member sees (SNOOZED, OVERDUE…), the same as list/get.
      const saved = await tx.careReminder.findUniqueOrThrow({ where: { id } });
      return { ...saved, state: visibleCareState(saved) };
    });
  }
  private assertOpen(state: string) {
    if ((CLOSED_CARE_STATES as readonly string[]).includes(state)) throw new ValidationApiException({ reason: "This care item is closed; its history is preserved." });
  }
  private validate(dto: { title: string; dueAt: string; recurrence?: string; intervalDays?: number; weekdays?: number[]; untilDate?: string }) {
    if (dto.recurrence === "WEEKDAYS" && !dto.weekdays?.length) throw new ValidationApiException({ field: "weekdays" });
    if (dto.untilDate && new Date(dto.untilDate) < new Date(dto.dueAt)) throw new ValidationApiException({ field: "untilDate", reason: "Must not be before the first due time." });
    if (!dto.title.trim()) throw new ValidationApiException({ field: "title" });
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(dto.dueAt) || !Number.isFinite(new Date(dto.dueAt).getTime())) throw new ValidationApiException({ field: "dueAt", reason: "Timestamp must include a timezone." });
    if (dto.recurrence === "CUSTOM" && !dto.intervalDays) throw new ValidationApiException({ field: "intervalDays" });
  }

  /** The assignee must be able to act on this pet's care (household member or care-handoff recipient). */
  private async assertAssignable(petId: string, assignee: string | null | undefined) {
    if (!assignee) return;
    if (!(await this.access.getEffectivePermissions(petId, assignee))?.canEditCareProfile) throw new ValidationApiException({ field: "assignedToUserId", reason: "ASSIGNEE_CANNOT_EDIT_CARE" });
  }

  private async notifyAssignee(petId: string, careItemId: string, title: string, assignee: string | null, actorUserId: string) {
    if (!assignee || assignee === actorUserId) return;
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { name: true, householdId: true } });
    await this.notifications.notify({ userId: assignee, type: "care.assigned", category: "HEALTH", petId, householdId: pet.householdId, deepLink: NotificationDeepLinks.careItem(petId, careItemId), entityType: "CareReminder", entityId: careItemId, templateParams: { petName: pet.name, title } });
  }

  private async displayNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const users = unique.length ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } }) : [];
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
}
