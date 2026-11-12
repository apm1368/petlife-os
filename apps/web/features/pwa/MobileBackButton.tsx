"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight } from "@petlife/ui";
import { localeDirection, isRouteLocale } from "@/lib/i18n/config";
import { hasInAppHistory } from "./pwa-runtime";
import { isMobileTabRoot } from "@/features/navigation/consumer-nav";

/**
 * Path prefixes that are only a level in a URL, not a page of their own (e.g. /travel/stays/:id has no /travel/stays).
 * back-target.test.ts checks every member and public route against this, so a new route can't add a 404.
 */
const NOT_A_PAGE: readonly RegExp[] = [
  /^\/animal-support\/organizations$/,
  /^\/blog\/(category|tag)$/,
  /^\/checkout\/[^/]+$/,
  /^\/community\/posts$/,
  /^\/health-share$/,
  /^\/insurer\/applications$/,
  /^\/join(\/clinic)?$/,
  /^\/help\/(articles|categories)$/,
  /^\/invitations$/,
  /^\/pet-card$/,
  /^\/profile\/household\/pets(\/[^/]+)?$/,
  /^\/providers$/,
  /^\/s$/,
  /^\/services\/[^/]+\/[^/]+$/,
  /^\/shop\/sellers$/,
  /^\/status\/incidents$/,
  /^\/travel\/(book|bookings|stays)$/,
  /^\/vet$/,
];

/** Where "back" goes when the page was opened directly (a notification, a shared link, the installed app's start). */
export function parentPath(pathKey: string): string {
  const parts = pathKey.split("?")[0]!.split("/").filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const candidate = `/${parts.join("/")}`;
    if (!NOT_A_PAGE.some((pattern) => pattern.test(candidate))) return candidate;
  }
  return "/home";
}

/**
 * App-style back button in the member header on phones (CSS shows it only at ≤ 768px). Hidden on the five tab
 * roots, where the bottom bar is the navigation. Goes back in the app's own history when there is one, otherwise
 * to the parent page, so it never leaves the site.
 */
export function MobileBackButton() {
  const t = useTranslations("pwa.header");
  const locale = useLocale();
  const router = useRouter();
  const pathKey = (usePathname() ?? "").replace(new RegExp(`^/${locale}(?=/|$)`), "") || "/";
  if (isMobileTabRoot(pathKey)) return null;
  const rtl = isRouteLocale(locale) && localeDirection[locale] === "rtl";
  const Icon = rtl ? ArrowRight : ArrowLeft;
  return (
    <button
      type="button"
      className="member-header__back"
      aria-label={t("back")}
      onClick={() => (hasInAppHistory() ? router.back() : router.push(`/${locale}${parentPath(pathKey)}`))}
    >
      <Icon size={22} aria-hidden="true" />
    </button>
  );
}
