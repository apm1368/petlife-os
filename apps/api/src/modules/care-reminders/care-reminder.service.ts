import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import { nextCareDate, visibleCareState } from "./care-time";
import { EntitlementService } from "../subscriptions/entitlement.service";
import type { CreateReminderDto, EditReminderDto, ReminderActionDto } from "./care-reminder.dto";

@Injectable()
export class CareReminderService {
  constructor(private readonly prisma: PrismaService, private readonly access: PetAccessService, private readonly entitlements: EntitlementService) {}

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
  async create(petId: string, userId: string, dto: CreateReminderDto) {
    this.validate(dto);
    // Personal reminders are a plan feature (care.reminders). Reminders the record derives (vaccines due…)
    // are never gated, and existing reminders stay readable and actionable after a downgrade.
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
    await this.entitlements.assertFeature(pet.householdId, "care.reminders");
    return this.prisma.$transaction(async tx => {
      const row = await tx.careReminder.create({ data: { petId, createdByUserId: userId, title: dto.title.trim(), type: dto.type, dueAt: new Date(dto.dueAt), originalDueAt: new Date(dto.dueAt), recurrence: dto.recurrence ?? "ONCE", intervalDays: dto.intervalDays } });
      await tx.domainEvent.create({ data: { type: "CareReminderCreated", aggregateType: "Pet", aggregateId: petId, payload: { petId, careItemId: row.id, actorUserId: userId } } });
      return { ...row, state: visibleCareState(row) };
    });
  }
  async edit(petId: string, id: string, userId: string, dto: EditReminderDto) {
    const row = await this.get(petId, id, userId);
    this.assertOpen(row.state);
    if (row.source !== "USER_CREATED") throw new ValidationApiException({ reason: "Source-authored care cannot be edited; adjust its reminder time instead." });
    this.validate({ ...row, ...dto, dueAt: dto.dueAt ?? row.dueAt.toISOString(), intervalDays: dto.intervalDays ?? row.intervalDays ?? undefined });
    return this.prisma.$transaction(async tx => {
      const updated = await tx.careReminder.updateMany({ where: { id, petId, version: row.version }, data: { ...dto, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, notifiedAt: dto.dueAt ? null : undefined, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ValidationApiException({ reason: "Care item changed; reload before editing." });
      await tx.domainEvent.create({ data: { type: "CareReminderEdited", aggregateType: "Pet", aggregateId: petId, payload: { petId, careItemId: id, actorUserId: userId } } });
      const saved = await tx.careReminder.findUniqueOrThrow({ where: { id } });
      return { ...saved, state: visibleCareState(saved) };
    });
  }
  async act(petId: string, id: string, userId: string, dto: ReminderActionDto) {
    const row = await this.get(petId, id, userId);
    this.assertOpen(row.state);
    const now = new Date();
    const at = dto.at ? new Date(dto.at) : null;
    if ((dto.action === "SNOOZE" || dto.action === "RESCHEDULE") && (!at || at <= now || !/(Z|[+-]\d{2}:\d{2})$/.test(dto.at!))) throw new ValidationApiException({ field: "at", reason: "Choose a future time including its timezone." });
    return this.prisma.$transaction(async tx => {
      const data = dto.action === "COMPLETE" ? { state: "COMPLETED", completedAt: now } : dto.action === "CANCEL" ? { state: "CANCELLED", cancelledAt: now } : dto.action === "SNOOZE" ? { snoozedUntil: at, notifiedAt: null } : { dueAt: at!, snoozedUntil: null, notifiedAt: null };
      const updated = await tx.careReminder.updateMany({ where: { id, petId, version: row.version }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ValidationApiException({ reason: "Care item changed; reload before acting." });
      await tx.domainEvent.create({ data: { type: dto.action === "COMPLETE" ? "CareReminderCompleted" : "CareReminderChanged", aggregateType: "Pet", aggregateId: petId, payload: { petId, careItemId: id, actorUserId: userId, action: dto.action, originalDueAt: row.originalDueAt.toISOString(), at: dto.at ?? null } } });
      if (dto.action === "COMPLETE") {
        const next = nextCareDate(row.dueAt, row.recurrence, row.intervalDays);
        if (next) await tx.careReminder.create({ data: { petId, createdByUserId: row.createdByUserId, title: row.title, type: row.type, source: row.source, sourceId: row.sourceId, parentId: row.id, originalDueAt: next, dueAt: next, recurrence: row.recurrence, intervalDays: row.intervalDays } });
      }
      // Responses carry the state the member sees (SNOOZED, OVERDUE…), the same as list/get.
      const saved = await tx.careReminder.findUniqueOrThrow({ where: { id } });
      return { ...saved, state: visibleCareState(saved) };
    });
  }
  private assertOpen(state: string) {
    if (state === "COMPLETED" || state === "CANCELLED") throw new ValidationApiException({ reason: "This care item is closed; its history is preserved." });
  }
  private validate(dto: { title: string; dueAt: string; recurrence?: string; intervalDays?: number }) {
    if (!dto.title.trim()) throw new ValidationApiException({ field: "title" });
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(dto.dueAt) || !Number.isFinite(new Date(dto.dueAt).getTime())) throw new ValidationApiException({ field: "dueAt", reason: "Timestamp must include a timezone." });
    if (dto.recurrence === "CUSTOM" && !dto.intervalDays) throw new ValidationApiException({ field: "intervalDays" });
  }
}
