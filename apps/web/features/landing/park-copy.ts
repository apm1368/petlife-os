import { useTranslations } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";
import type faMessages from "@/messages/fa.json";

export const parkDestinations = [
  { key: "shop", href: "/shop", x: 9.4, y: 47, width: 10.4, tone: "plum" },
  { key: "vet", href: "/vet/find", x: 21.2, y: 48.5, width: 10.4, tone: "teal" },
  { key: "grooming", href: "/services/grooming", x: 31.1, y: 50, width: 10.4, tone: "rose" },
  { key: "boarding", href: "/services/boarding", x: 42.4, y: 50, width: 10.4, tone: "copper" },
  { key: "travel", href: "/travel", x: 56, y: 50, width: 10.4, tone: "green" },
  { key: "taxi", href: "/services/pet-taxi", x: 71.2, y: 49.5, width: 10.4, tone: "gold" },
  { key: "support", href: "/animal-support/needs", x: 81.6, y: 48.5, width: 10.4, tone: "coral" },
  { key: "insurance", href: "/insurance", x: 92.1, y: 47.5, width: 10.4, tone: "blue" },
] as const;
export type ParkDestinationKey = typeof parkDestinations[number]["key"];
/** The hero scene image per language: the same approved park, with pavilion labels painted in Latin for en/de/es. */
export const parkImageSrc: Record<RouteLocale, string> = {
  fa: "/images/landing/tehran-park.webp",
  en: "/images/landing/tehran-park-en.webp",
  de: "/images/landing/tehran-park-en.webp",
  es: "/images/landing/tehran-park-en.webp",
};

/** Park and hero copy lives in messages/{fa,en,de,es}.json under `pattern2026.park`, read through next-intl. */
export type ParkText = (typeof faMessages)["pattern2026"]["park"];
export type ParkCopy = ParkText & { imageSrc: string };

/** The park copy in the page's language, plus its scene image. */
export function useParkCopy(locale: RouteLocale): ParkCopy {
  const text = useTranslations("pattern2026").raw("park") as ParkText;
  return { ...text, imageSrc: parkImageSrc[locale] };
}
