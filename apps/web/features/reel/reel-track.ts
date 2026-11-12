import type { RouteLocale } from "@/lib/i18n/config";

/**
 * The reel's instrumental soundtrack. CC0 1.0 (public domain dedication): commercial use without attribution is allowed;
 * we credit it on /credits anyway. 48 s from 0:12 of the original, faded in/out and re-encoded to 64 kbps Opus (WebM).
 */
export const REEL_TRACK = {
  src: "/audio/reel-toy-box.webm",
  mime: 'audio/webm; codecs="opus"',
  title: "Toy Box",
  author: "HoliznaCC0",
  album: "Spring Woke Me Up",
  page: "https://freemusicarchive.org/music/holiznacc0/spring-woke-me-up/toy-box/",
  license: "CC0 1.0 Universal",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
} as const;

export const musicCreditCopy: Record<RouteLocale, { heading: string; usage: string; licence: string }> = {
  fa: { heading: "موسیقی", usage: "موسیقی بی‌کلام ریل‌های سایت؛ ۴۸ ثانیه از قطعه، با محوشدن ابتدا و انتها و فشرده‌سازی مجدد.", licence: "مجوز" },
  en: { heading: "Music", usage: "The wordless soundtrack of the site's reels; a 48-second excerpt, faded in and out and re-encoded.", licence: "Licence" },
  de: { heading: "Musik", usage: "Die Instrumentalmusik der Reels auf der Website; ein 48-sekündiger Ausschnitt, ein- und ausgeblendet und neu kodiert.", licence: "Lizenz" },
  es: { heading: "Música", usage: "La música instrumental de los reels del sitio; un fragmento de 48 segundos, con fundido de entrada y salida y recodificado.", licence: "Licencia" },
};
