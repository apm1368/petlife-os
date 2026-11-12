import { useTranslations } from "next-intl";
import type faMessages from "@/messages/fa.json";

/** Section reels (docs/design/pattern-2026-11/pages.md): one reel per page family, on public and member pages. */
export type Family = "care" | "services" | "shop" | "travel" | "safe" | "together" | "learn";

/**
 * Member pages join the family of what they do; personal records and the dashboard have their own "care" reel.
 * Flows that must stay quiet get none: checkout, onboarding, invitations, and the NGO and insurer workspaces.
 */
export function familyForPath(pathname: string): Family | null {
  const path = pathname.replace(/^\/(fa|en|de|es)(?=\/|$)/, "");
  if (/^\/(home|pets|care-calendar|notifications|profile|subscription|ai)(\/|$)/.test(path)) return "care";
  if (/^\/(services|vet|providers|places|bookings|explore)(\/|$)/.test(path)) return "services";
  if (/^\/(shop|cart|orders|repeat-delivery|favorites)(\/|$)/.test(path)) return "shop";
  if (/^\/travel(\/|$)/.test(path)) return "travel";
  if (/^\/(insurance|lost-pets)(\/|$)/.test(path)) return "safe";
  if (/^\/(community|animal-support|donations|memorials|about)(\/|$)/.test(path)) return "together";
  if (/^\/(blog|guides|help|contact|status|legal|credits|support)(\/|$)/.test(path)) return "learn";
  return null;
}

/** Section-reel copy lives in messages/{fa,en,de,es}.json under `pattern2026.reels`, read through next-intl. */
type Scene = { k: string; s: string };
export type FamilyText = { eyebrow: string; title: string; lede: string; cta: string; a: Scene; b: Scene; labels: Record<string, string> };
export type FamilyCopy = Record<Family, FamilyText>;
// The message catalog must provide every family; this fails to compile if one goes missing.
const _families: Record<Family, unknown> = {} as (typeof faMessages)["pattern2026"]["reels"];
void _families;

/** Every family's reel copy in the page's language. */
export function useFamilyCopy(): FamilyCopy {
  return useTranslations("pattern2026").raw("reels") as FamilyCopy;
}
