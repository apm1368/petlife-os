import { Injectable } from "@nestjs/common";
import type { Notification, NotificationDelivery } from "@prisma/client";
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

  async list(userId: string, query: PaginationQueryDto): Promise<PaginatedDto<NotificationDto>> {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, include: { deliveries: true }, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.notification.count({ where: { userId } }),
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

  async markAllRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updatedCount: result.count };
  }
}
