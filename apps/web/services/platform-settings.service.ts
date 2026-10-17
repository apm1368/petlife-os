import { apiFetch } from "@/lib/api/client";
export interface PublicPlatformSettings {
  "platform.announcement": { fa?: string; en?: string } | null;
}
export const platformSettingsService = {
  publicSettings: (signal?: AbortSignal) => apiFetch<PublicPlatformSettings>("/settings/public", { signal }),
};
