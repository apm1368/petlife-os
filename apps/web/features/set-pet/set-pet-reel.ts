import type { RouteLocale } from "@/lib/i18n/config";

/** X7's 90-second Set Pet reel (16:9, subtitles burned in) per site language, from the CMS media store (same origin). */
export type SetPetReel = { video: string; poster: string; durationS: number; width: number; height: number };

/**
 * Filled from X7's manifest once rendered: content-addressed, immutable cms/media files (e.g. bundle-<sha>.webm), so a
 * re-render only changes a line here. X7's manifest, 2026-11-13 (VP9/Opus WebM, 90 s, 1280×720, subtitles burned in).
 */
export const SET_PET_REELS: Partial<Record<RouteLocale, SetPetReel>> = {
  fa: { video: "/api/uploads/cms/media/bundle-58ec92a86d560f979a63349db2ddd159.webm", poster: "/api/uploads/cms/media/bundle-88fd8813bfaabbb94d3f17a006f3c66c.webp", durationS: 90, width: 1280, height: 720 },
  en: { video: "/api/uploads/cms/media/bundle-859b45ea918070c3348ece8e697053b9.webm", poster: "/api/uploads/cms/media/bundle-460d377ece99a77aa5b4f2688abd4dfb.webp", durationS: 90, width: 1280, height: 720 },
  de: { video: "/api/uploads/cms/media/bundle-dd980f32509f45dee8aaa3d243f85477.webm", poster: "/api/uploads/cms/media/bundle-d12b942a29312eb0d15288ed8d623db2.webp", durationS: 90, width: 1280, height: 720 },
  es: { video: "/api/uploads/cms/media/bundle-715a8b0ce9d77b3e506adf45381001ca.webm", poster: "/api/uploads/cms/media/bundle-69364d289bfa92a3f6dfe95e6a466bab.webp", durationS: 90, width: 1280, height: 720 },
  ar: { video: "/api/uploads/cms/media/bundle-b5b5f57496110a3b57c645a65acce26f.webm", poster: "/api/uploads/cms/media/bundle-f46ca8d9de7ed9078940e7cb0fb5d089.webp", durationS: 90, width: 1280, height: 720 },
  nl: { video: "/api/uploads/cms/media/bundle-098cd08fc36d2e3e294aa68e6861de3b.webm", poster: "/api/uploads/cms/media/bundle-53f3961c65962721ca5e0228556d9420.webp", durationS: 90, width: 1280, height: 720 },
};

const CMS_MEDIA = /^(https:\/\/opetlife\.ir)?\/api\/uploads\/cms\/media\/[\w./-]+\.(webm|mp4|webp|jpg|png)$/;

/** The reel for a locale, only when both files are ours (CMS media on our own origin). */
export function setPetReel(locale: RouteLocale, reels: Partial<Record<RouteLocale, SetPetReel>> = SET_PET_REELS): SetPetReel | null {
  const reel = reels[locale];
  return reel && CMS_MEDIA.test(reel.video) && CMS_MEDIA.test(reel.poster) ? reel : null;
}
