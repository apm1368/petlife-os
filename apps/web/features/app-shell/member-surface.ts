import { LOCALE_PREFIX } from "@/lib/i18n/config";
/** Personal records retain the immersive frame; shopping and service journeys have their own surface. */
export function memberSurface(pathname: string): "glass" | "service" {
  const path = pathname.replace(LOCALE_PREFIX, "");
  return /^\/(home|pets|profile|subscription|notifications|care-calendar|support)(\/|$)/.test(path) ? "glass" : "service";
}
