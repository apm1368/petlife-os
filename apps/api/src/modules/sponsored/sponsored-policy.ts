import { createHmac } from "node:crypto";
import { ProviderType } from "@prisma/client";

/** Personal data on a click (account id, IP hash) is kept this long, then erased; the outcome and cost stay. */
export const SPONSORED_CLICK_PERSONAL_DATA_DAYS = 90;
/** A partner's daily budget and ceiling bounds, integer rials. */
export const SPONSORED_MAX_DAILY_BUDGET_IRR = 1_000_000_000;
export const SPONSORED_MAX_CPC_CEILING_IRR = 10_000_000;
export const SPONSORED_LOCALES = ["fa", "en", "de", "es", "ar", "nl"] as const;

export const VET_PROVIDER_TYPES: ProviderType[] = [ProviderType.VET_CLINIC, ProviderType.VET_HOSPITAL, ProviderType.VETERINARIAN];
/** The services directory's category codes → provider types (the same codes the discovery list takes). */
export const SERVICE_CATEGORY_TYPES: Record<string, ProviderType[]> = {
  VET: VET_PROVIDER_TYPES,
  GROOMING: [ProviderType.GROOMER],
  TRAINING: [ProviderType.TRAINER],
  WALKING: [ProviderType.WALKER],
  SITTING: [ProviderType.SITTER],
  BOARDING: [ProviderType.BOARDING],
  PET_TAXI: [ProviderType.PET_TAXI],
  OTHER: [ProviderType.MULTI_SERVICE_PROVIDER],
};
/** Provider types that can appear in the services directory (everything but stays, which live under travel). */
export const SERVICE_PROVIDER_TYPES: ProviderType[] = Object.values(ProviderType).filter((t) => t !== ProviderType.TRAVEL_ACCOMMODATION && !VET_PROVIDER_TYPES.includes(t));

/** The Tehran calendar day of an instant, as the UTC midnight Postgres stores for a DATE column. */
export function tehranDay(at: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** A keyed hash of the client IP: lets us count one billed click per IP per day without ever storing the IP. */
export function hashIp(secret: string, ip: string | undefined | null): string | null {
  const value = ip?.trim();
  if (!value) return null;
  return createHmac("sha256", secret).update(`sponsored-click:${value}`).digest("hex");
}

const BOT_UA = /bot|crawl|spider|slurp|preview|headless|phantom|puppeteer|playwright|selenium|curl|wget|python|httpclient|okhttp|java\/|go-http|axios|node-fetch|undici|postman|insomnia|facebookexternalhit|whatsapp|telegram|skype|discord|slack|embedly|lighthouse|pingdom|uptime|monitor/i;

/**
 * Automated or speculative requests never pay: a missing or bot-like user agent, or a browser prefetch/prerender
 * (Sec-Purpose / Purpose headers). These are logged as BOT.
 */
export function looksAutomated(userAgent: string | undefined, headers: Record<string, string | string[] | undefined>): boolean {
  const ua = userAgent?.trim() ?? "";
  if (ua.length < 10 || BOT_UA.test(ua)) return true;
  const purpose = [headers["sec-purpose"], headers["purpose"], headers["x-purpose"], headers["x-moz"]].flat().filter(Boolean).join(" ").toLowerCase();
  return /prefetch|prerender|preview/.test(purpose);
}
