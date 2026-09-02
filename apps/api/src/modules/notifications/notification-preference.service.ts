import { Injectable } from "@nestjs/common";
import { NotificationCategory, NotificationChannel } from "@prisma/client";
import type { NotificationPreferencesDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { getCountryConfig } from "../../common/country/country-config";
import type { UpdateNotificationPreferencesDto } from "./dto/notification-preference.dto";

/**
 * Security-critical sends never consult this table at all (spec: "security-
 * critical messages may not be fully suppressible") — NotificationOrchestrator
 * checks this set before ever calling `resolve()`.
 */
export const NON_SUPPRESSIBLE_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([NotificationCategory.SECURITY]);

const ALL_CATEGORIES = Object.values(NotificationCategory);
const ALL_CHANNELS: NotificationChannel[] = [NotificationChannel.IN_APP, NotificationChannel.SMS];

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves whether (category, channel) is enabled for `userId`. No row
   * means "enabled" (the default) — EXCEPT MARKETING, whose default comes
   * from CountryConfig (spec: "marketing consent must never be inferred
   * from transactional messaging consent" — an explicit opt-in-by-default
   * of `false` for Iran, never silently `true`).
   */
  async resolve(userId: string, category: NotificationCategory, channel: NotificationChannel): Promise<boolean> {
    if (NON_SUPPRESSIBLE_CATEGORIES.has(category)) return true;
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId_category_channel: { userId, category, channel } } });
    if (row) return row.enabled;
    if (category === NotificationCategory.MARKETING) return getCountryConfig().marketingDefaultEnabled;
    return true;
  }

  async getAll(userId: string): Promise<NotificationPreferencesDto> {
    const [rows, quietHours] = await Promise.all([
      this.prisma.notificationPreference.findMany({ where: { userId } }),
      this.prisma.notificationQuietHours.findUnique({ where: { userId } }),
    ]);
    const byKey = new Map(rows.map((r) => [`${r.category}:${r.channel}`, r.enabled]));

    const preferences = ALL_CATEGORIES.flatMap((category) =>
      ALL_CHANNELS.map((channel) => ({
        category,
        channel,
        enabled: byKey.get(`${category}:${channel}`) ?? (category === NotificationCategory.MARKETING ? getCountryConfig().marketingDefaultEnabled : true),
      })),
    );

    const country = getCountryConfig();
    return {
      preferences: preferences as unknown as NotificationPreferencesDto["preferences"],
      quietHours: quietHours
        ? { enabled: quietHours.enabled, startTime: quietHours.startTime, endTime: quietHours.endTime, timezone: quietHours.timezone }
        : { enabled: false, startTime: "22:00", endTime: "08:00", timezone: country.defaultTimezone },
    };
  }

  async update(userId: string, dto: UpdateNotificationPreferencesDto): Promise<NotificationPreferencesDto> {
    await this.prisma.$transaction(async (tx) => {
      for (const pref of dto.preferences ?? []) {
        // Security-critical categories are never persisted as disabled — silently coerced to true rather than rejecting the whole request, since the frontend never renders a toggle for them in the first place.
        const enabled = NON_SUPPRESSIBLE_CATEGORIES.has(pref.category) ? true : pref.enabled;
        await tx.notificationPreference.upsert({
          where: { userId_category_channel: { userId, category: pref.category, channel: pref.channel } },
          create: { userId, category: pref.category, channel: pref.channel, enabled },
          update: { enabled },
        });
      }
      if (dto.quietHours) {
        await tx.notificationQuietHours.upsert({
          where: { userId },
          create: { userId, ...dto.quietHours },
          update: { ...dto.quietHours },
        });
      }
    });
    return this.getAll(userId);
  }
}
