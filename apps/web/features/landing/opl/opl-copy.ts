import { useTranslations } from "next-intl";
import type faMessages from "@/messages/fa.json";

/** A sentence with a default form and a form that names the visitor's pet ({name}). */
export type NameAware = { d: string; n: string };
export const withName = (t: NameAware, name: string) => (name ? t.n.replace("{name}", name) : t.d);
export const fillVars = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");

export type WorldKey = "health" | "daily" | "travel" | "safe" | "together";
export const worldOrder: WorldKey[] = ["health", "daily", "travel", "safe", "together"];
export const worldRoutes: Record<WorldKey, { cta: string; feats: [string, string, string, string] }> = {
  health: { cta: "/register", feats: ["/pets", "/care-calendar", "/vet/find", "/pets"] },
  daily: { cta: "/shop", feats: ["/shop", "/repeat-delivery", "/services/grooming", "/services/boarding"] },
  travel: { cta: "/travel", feats: ["/travel/search", "/travel/compare", "/travel/trips", "/pets"] },
  safe: { cta: "/insurance", feats: ["/insurance", "/lost-pets", "/pets", "/support"] },
  together: { cta: "/community", feats: ["/community", "/animal-support/needs", "/pets", "/pets"] },
};

/**
 * The landing pattern's copy (docs/design/pattern-2026-11) lives in messages/{fa,en,de,es}.json under
 * `pattern2026.opl`; components read it through next-intl. Every string keeps the shape it had here.
 */
export type OplCopy = (typeof faMessages)["pattern2026"]["opl"];

/** The landing copy in the page's language (server or client component). */
export function useOplCopy(): OplCopy {
  return useTranslations("pattern2026").raw("opl") as OplCopy;
}
