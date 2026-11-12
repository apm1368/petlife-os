import fa from "@/messages/fa.json";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import type { RouteLocale } from "@/lib/i18n/config";
import { parkImageSrc, type ParkCopy } from "@/features/landing/park-copy";
import type { OplCopy } from "@/features/landing/opl/opl-copy";
import type { FamilyCopy } from "@/features/reel/family-copy";

/** The 2026-11 pattern copy straight from the message catalogs, for assertions in tests. */
const catalogs = { fa, en, de, es } as const;
export const patternCopyFor = (locale: RouteLocale) => catalogs[locale].pattern2026;
export const oplCopyFor = (locale: RouteLocale) => patternCopyFor(locale).opl as OplCopy;
export const familyCopyFor = (locale: RouteLocale) => patternCopyFor(locale).reels as FamilyCopy;
export const parkCopyFor = (locale: RouteLocale): ParkCopy => ({ ...patternCopyFor(locale).park, imageSrc: parkImageSrc[locale] });
