import { NOTIFICATION_GROUPS, notificationGroup, notificationGroupWhere, type NotificationGroup } from "./notification-groups";
import { Injectable } from "@nestjs/common";
import type { Notification, NotificationDelivery, Prisma } from "@prisma/client";
import type { NotificationDto, PaginatedDto, UnreadCountDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../common/pagination/pagination.dto";

export type NotificationWithDeliveries = Notification & { deliveries: NotificationDelivery[] };

/** Exported for reuse by Admin Customer 360 (Handoff 11) — Communications History must reuse this as the source of truth rather than building a second read path. */
export function toNotificationDto(row: NotificationWithDeliveries): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    category: row.category as unknown as NotificationDto["category"],
    priority: row.priority as unknown as NotificationDto["priority"],
    title: row.title,
    body: row.body,
    locale: row.locale as unknown as NotificationDto["locale"],
    deepLink: row.deepLink,
    entityType: row.entityType,
    entityId: row.entityId,
    group: notificationGroup(row.category, row.type),
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
    deliveries: row.deliveries.map((d) => ({
      id: d.id,
      channel: d.channel as unknown as NotificationDto["deliveries"][number]["channel"],
      provider: d.provider as unknown as NotificationDto["deliveries"][number]["provider"],
      status: d.status as unknown as NotificationDto["deliveries"][number]["status"],
      destinationMasked: d.destinationMasked,
      attemptCount: d.attemptCount,
      failureKind: d.failureKind as unknown as NotificationDto["deliveries"][number]["failureKind"],
      failureCode: d.failureCode,
      failureMessage: d.failureMessage,
      deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
      failedAt: d.failedAt ? d.failedAt.toISOString() : null,
    })),
  };
}

/**
 * Every method here is scoped to `userId` at the query level — never a
 * separate authorization check, matching how every other consumer-facing
 * "my own records" service in this codebase (MyOrders, MyBookings) enforces
 * isolation. There is no cross-user notification read path anywhere.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: PaginationQueryDto & { group?: NotificationGroup }): Promise<PaginatedDto<NotificationDto>> {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.NotificationWhereInput = { userId, dismissedAt: null, ...(query.group ? notificationGroupWhere(query.group) : {}) };
    const [rows, total] = await Promise.all([
      // Dismissed rows (incl. categories the person switched off in-app) stay recorded but out of the inbox.
      this.prisma.notification.findMany({ where, include: { deliveries: true }, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.notification.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toNotificationDto), total, page, pageSize);
  }

  async unreadCount(userId: string): Promise<UnreadCountDto> {
    const unreadCount = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { unreadCount };
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const existing = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!existing || existing.userId !== userId) throw new NotificationNotFoundException({ notificationId });
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: existing.readAt ? {} : { readAt: new Date() },
      include: { deliveries: true },
    });
    return toNotificationDto(updated);
  }

  /** All of the caller's unread notifications — or only one group's. Always scoped to the caller. */
  async markAllRead(userId: string, group?: NotificationGroup): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null, ...(group ? notificationGroupWhere(group) : {}) }, data: { readAt: new Date() } });
    return { updatedCount: result.count };
  }

  /** Marks one server-computed group (see grouped()) read. */
  async markGroupKeyRead(userId: string, groupKey: string): Promise<{ updatedCount: number }> {
    const [type, entityType, entityId] = groupKey.split("|");
    if (!type || !entityType || !entityId) return { updatedCount: 0 };
    const where: Prisma.NotificationWhereInput = entityType === "_" ? { id: entityId } : { type, entityType, entityId };
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null, ...where }, data: { readAt: new Date() } });
    return { updatedCount: result.count };
  }

  /**
   * Server-side grouping of the recent inbox: repeated notifications of the same type about the same entity
   * (e.g. three messages in one conversation) collapse into one row. Unrelated entities are never merged.
   */
  async grouped(userId: string, limit = 200) {
    const rows = await this.prisma.notification.findMany({ where: { userId, dismissedAt: null }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 500) });
    const groups = new Map<string, { groupKey: string; group: NotificationGroup; type: string; entityType: string | null; entityId: string | null; groupCount: number; unreadCount: number; latestAt: string; title: string; body: string; deepLink: string | null; notificationIds: string[] }>();
    for (const r of rows) {
      const groupKey = r.entityType && r.entityId ? `${r.type}|${r.entityType}|${r.entityId}` : `${r.type}|_|${r.id}`;
      const g = groups.get(groupKey);
      if (g) {
        g.groupCount++;
        if (!r.readAt) g.unreadCount++;
        g.notificationIds.push(r.id);
      } else {
        groups.set(groupKey, { groupKey, group: notificationGroup(r.category, r.type), type: r.type, entityType: r.entityType, entityId: r.entityId, groupCount: 1, unreadCount: r.readAt ? 0 : 1, latestAt: r.createdAt.toISOString(), title: r.title, body: r.body, deepLink: r.deepLink, notificationIds: [r.id] });
      }
    }
    return [...groups.values()];
  }

  async digestPreferences(userId: string) {
    const rows = await this.prisma.notificationDigestPreference.findMany({ where: { userId } });
    return {
      deliveryStatus: "STORED_ONLY" as const,
      groups: NOTIFICATION_GROUPS.map((group) => ({ group, mode: (rows.find((r) => r.group === group)?.mode ?? "INSTANT") as "INSTANT" | "DAILY" | "OFF" })),
    };
  }

  async setDigestPreference(userId: string, group: NotificationGroup, mode: "INSTANT" | "DAILY" | "OFF") {
    await this.prisma.notificationDigestPreference.upsert({ where: { userId_group: { userId, group } }, create: { userId, group, mode }, update: { mode } });
    return this.digestPreferences(userId);
  }
}
