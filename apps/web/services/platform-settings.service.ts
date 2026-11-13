import { apiFetch } from "@/lib/api/client";

export type LocalizedSettingText = { fa?: string; en?: string; de?: string; es?: string } | null;

/** GET /settings/public — every PUBLIC key in apps/api platform-settings/setting-definitions.ts. */
export interface PublicPlatformSettings {
  "platform.announcement": LocalizedSettingText;
  "platform.announcementTone"?: "info" | "success" | "warning" | "urgent";
  "platform.announcementLink"?: string | null;
  "platform.announcementAudience"?: "members" | "everyone";
  "site.tagline"?: LocalizedSettingText;
  "site.footerNote"?: LocalizedSettingText;
  "site.contactEmail"?: string | null;
  "site.contactPhone"?: string | null;
  "site.contactAddress"?: LocalizedSettingText;
  "site.workingHours"?: LocalizedSettingText;
  "social.instagram"?: string | null;
  "social.telegram"?: string | null;
  "social.whatsapp"?: string | null;
  "social.x"?: string | null;
  "social.linkedin"?: string | null;
  "social.youtube"?: string | null;
  "social.aparat"?: string | null;
  "social.bale"?: string | null;
  "social.instagramEnabled"?: boolean;
  "social.telegramEnabled"?: boolean;
  "social.whatsappEnabled"?: boolean;
  "social.baleEnabled"?: boolean;
  "social.xEnabled"?: boolean;
  "social.linkedinEnabled"?: boolean;
  "social.youtubeEnabled"?: boolean;
  "social.aparatEnabled"?: boolean;
  "trust.enamadEnabled"?: boolean;
  "trust.enamadId"?: string | null;
  "trust.enamadCode"?: string | null;
  "maintenance.enabled"?: boolean;
  "maintenance.message"?: LocalizedSettingText;
  "features.shop"?: boolean;
  "features.services"?: boolean;
  "features.travel"?: boolean;
  "features.insurance"?: boolean;
  "features.places"?: boolean;
  "features.community"?: boolean;
  "features.lostPets"?: boolean;
  "features.animalSupport"?: boolean;
  "features.blog"?: boolean;
  "features.memorials"?: boolean;
  "auth.passwordSignupEnabled"?: boolean;
}
export const platformSettingsService = {
  publicSettings: (signal?: AbortSignal) => apiFetch<PublicPlatformSettings>("/settings/public", { signal }),
};
