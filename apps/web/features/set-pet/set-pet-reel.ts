import type { RouteLocale } from "@/lib/i18n/config";

/** X7's 90-second Set Pet reel (16:9, subtitles burned in) per site language, from the CMS media store (same origin). */
export type SetPetReel = { video: string; poster: string; durationS: number; width: number; height: number };

/**
 * Filled from X7's manifest once rendered: content-addressed, immutable cms/media files (e.g. bundle-<sha>.webm), so a
 * re-render only changes a line here. Until then the landing section shows the shirts mockup instead of the video.
 */
export const SET_PET_REELS: Partial<Record<RouteLocale, SetPetReel>> = {};

const CMS_MEDIA = /^(https:\/\/opetlife\.ir)?\/api\/uploads\/cms\/media\/[\w./-]+\.(webm|mp4|webp|jpg|png)$/;

/** The reel for a locale, only when both files are ours (CMS media on our own origin). */
export function setPetReel(locale: RouteLocale, reels: Partial<Record<RouteLocale, SetPetReel>> = SET_PET_REELS): SetPetReel | null {
  const reel = reels[locale];
  return reel && CMS_MEDIA.test(reel.video) && CMS_MEDIA.test(reel.poster) ? reel : null;
}
