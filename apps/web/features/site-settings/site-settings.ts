"use client";

import { useEffect, useSyncExternalStore } from "react";
import { platformSettingsService, type LocalizedSettingText, type PublicPlatformSettings } from "@/services/platform-settings.service";

/**
 * One shared copy of the public site settings per page load: the first component that asks fetches
 * /settings/public, everyone else subscribes. Refreshed every five minutes for long-lived tabs. Until it
 * arrives (or if it fails) every consumer behaves exactly as before the settings existed: features on,
 * no maintenance, no extra contact block.
 */
let snapshot: PublicPlatformSettings | null = null;
let inflight: Promise<void> | null = null;
let fetchedAt = 0;
const listeners = new Set<() => void>();
const REFRESH_MS = 5 * 60_000;

function load() {
  if (inflight || (snapshot && Date.now() - fetchedAt < REFRESH_MS)) return;
  inflight = Promise.resolve()
    .then(() => platformSettingsService.publicSettings())
    .then((value) => {
      snapshot = value ?? null;
      fetchedAt = Date.now();
      listeners.forEach((l) => l());
    })
    .catch(() => undefined)
    .finally(() => { inflight = null; });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSiteSettings(): PublicPlatformSettings | null {
  const value = useSyncExternalStore(subscribe, () => snapshot, () => null);
  useEffect(() => { load(); }, []);
  return value;
}

/** Test seam. */
export function __setSiteSettingsForTest(value: PublicPlatformSettings | null) {
  snapshot = value;
  fetchedAt = value ? Date.now() : 0;
  listeners.forEach((l) => l());
}

export function localizedSetting(value: LocalizedSettingText | undefined, locale: string): string | null {
  if (!value) return null;
  const v = value as Record<string, string | undefined>;
  return v[locale]?.trim() || v.en?.trim() || v.fa?.trim() || null;
}

export type FeatureKey = "shop" | "services" | "travel" | "insurance" | "places" | "community" | "lostPets" | "animalSupport" | "blog" | "memorials";

const FEATURE_PREFIXES: [FeatureKey, string[]][] = [
  ["shop", ["/shop", "/cart", "/checkout", "/orders", "/repeat-delivery", "/favorites"]],
  ["services", ["/services", "/bookings", "/providers", "/vet/find"]],
  ["travel", ["/travel"]],
  ["insurance", ["/insurance"]],
  ["places", ["/places"]],
  ["community", ["/community"]],
  ["lostPets", ["/lost-pets"]],
  ["animalSupport", ["/animal-support", "/donations"]],
  ["blog", ["/blog", "/guides"]],
  ["memorials", ["/memorials"]],
];

/** Which switchable product area a site path belongs to, if any. */
export function featureForHref(href: string): FeatureKey | null {
  const path = href.split(/[?#]/)[0] ?? href;
  for (const [key, prefixes] of FEATURE_PREFIXES) if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) return key;
  return null;
}

/** A path stays visible unless its area was explicitly switched off. */
export function isHrefEnabled(settings: PublicPlatformSettings | null, href: string): boolean {
  const key = featureForHref(href);
  if (!key || !settings) return true;
  return settings[`features.${key}` as keyof PublicPlatformSettings] !== false;
}

export function useHrefFilter() {
  const settings = useSiteSettings();
  return (href: string) => isHrefEnabled(settings, href);
}
