import { statusLabel } from "@/lib/status/status-labels";
import type { RouteLocale } from "@/lib/i18n/config";

/** Health record status/flag codes → words via the shared vocabulary (lab meanings first; generic otherwise). */
export function recordStatusLabel(code: string, locale: RouteLocale): string;
export function recordStatusLabel(code: string | null | undefined, locale: RouteLocale): string | null;
/** Compatibility overload for older fa/en-only detail components; new pages pass the full route locale. */
export function recordStatusLabel(code: string | null | undefined, fa: boolean): string | null;
export function recordStatusLabel(code: string | null | undefined, localeOrFa: RouteLocale | boolean): string | null {
  if (!code) return null;
  const locale = typeof localeOrFa === "boolean" ? (localeOrFa ? "fa" : "en") : localeOrFa;
  return statusLabel(code, locale, code === "NORMAL" || code === "ABNORMAL" ? "labFlag" : "lab");
}
