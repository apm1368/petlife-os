import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConsentKind, NotificationCategory, NotificationChannel } from "@prisma/client";
import type { AppEnv } from "../../config/env";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Batch 8 — the Privacy Center's marketing consent is the single source of truth for whether any marketing may be sent. */
  private async marketingConsent(userId: string): Promise<boolean> {
    const latest = await this.prisma.userConsent.findFirst({ where: { userId, kind: ConsentKind.MARKETING }, orderBy: { updatedAt: "desc" } });
    return Boolean(latest?.grantedAt && !latest.revokedAt);
  }

  /** Whether each channel actually reaches people today. SMS goes through the dev simulator unless Faraz is configured, and the Faraz adapter itself is not implemented yet. */
  private channelDelivery(): NonNullable<NotificationPreferencesDto["channels"]> {
    const provider = this.config.get("MESSAGING_PROVIDER", { infer: true });
    return [
      { channel: NotificationChannel.IN_APP as unknown as NonNullable<NotificationPreferencesDto["channels"]>[number]["channel"], delivery: "LIVE" },
      { channel: NotificationChannel.SMS as unknown as NonNullable<NotificationPreferencesDto["channels"]>[number]["channel"], delivery: provider === "dev" ? "SANDBOX" : "NOT_CONFIGURED" },
    ];
  }

  /**
   * Resolves whether (category, channel) is enabled for `userId`. No row
   * means "enabled" — except MARKETING, which is never sent without a
   * granted marketing consent (spec: "marketing consent must never be
   * inferred from transactional messaging consent"; Batch 8 made the
   * Privacy Center consent the single source of truth, off by default).
   */
  async resolve(userId: string, category: NotificationCategory, channel: NotificationChannel): Promise<boolean> {
    if (NON_SUPPRESSIBLE_CATEGORIES.has(category)) return true;
    if (category === NotificationCategory.MARKETING && !(await this.marketingConsent(userId))) return false;
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId_category_channel: { userId, category, channel } } });
    if (row) return row.enabled;
    return true;
  }

  async getAll(userId: string): Promise<NotificationPreferencesDto> {
    const [rows, quietHours, marketingConsent] = await Promise.all([
      this.prisma.notificationPreference.findMany({ where: { userId } }),
      this.prisma.notificationQuietHours.findUnique({ where: { userId } }),
      this.marketingConsent(userId),
    ]);
    const byKey = new Map(rows.map((r) => [`${r.category}:${r.channel}`, r.enabled]));

    const preferences = ALL_CATEGORIES.flatMap((category) =>
      ALL_CHANNELS.map((channel) => ({
        category,
        channel,
        enabled: NON_SUPPRESSIBLE_CATEGORIES.has(category) ? true : category === NotificationCategory.MARKETING && !marketingConsent ? false : (byKey.get(`${category}:${channel}`) ?? true),
      })),
    );

    const country = getCountryConfig();
    return {
      preferences: preferences as unknown as NotificationPreferencesDto["preferences"],
      requiredCategories: [...NON_SUPPRESSIBLE_CATEGORIES] as unknown as NotificationPreferencesDto["requiredCategories"],
      marketingConsentGranted: marketingConsent,
      channels: this.channelDelivery(),
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
