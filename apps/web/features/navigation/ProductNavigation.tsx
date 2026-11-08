"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export type NavigationKey = "home" | "health" | "services" | "shop" | "memories" | "healthAndVet" | "places" | "travel" | "insurance" | "animalSupport" | "community" | "blog";
export type NavigationItem = { path: string; key: NavigationKey; match?: (pathname: string) => boolean };
const inPath = (value: string) => (pathname: string) => pathname === value || pathname.startsWith(`${value}/`);
const petSection = (section: string) => (pathname: string) => new RegExp(`/pets/[^/]+/${section}(?:/|$)`).test(pathname);
export const globalDestinations: NavigationItem[] = [
  { path: "/", key: "home", match: (pathname) => pathname === "/" },
  { path: "/vet/find", key: "health", match: (pathname) => inPath("/vet")(pathname) || petSection("health")(pathname) },
  { path: "/services", key: "services", match: (pathname) => inPath("/services")(pathname) || inPath("/bookings")(pathname) },
  { path: "/shop", key: "shop", match: (pathname) => inPath("/shop")(pathname) || inPath("/cart")(pathname) || inPath("/checkout")(pathname) || inPath("/orders")(pathname) },
  { path: "/pets/active?view=memories", key: "memories", match: petSection("memories") },
];

export const exploreDestinations: NavigationItem[] = [
  { path: "/vet/find", key: "healthAndVet" }, { path: "/services", key: "services" },
  { path: "/shop", key: "shop" }, { path: "/places", key: "places" },
  { path: "/travel", key: "travel" }, { path: "/insurance", key: "insurance" },
  { path: "/animal-support", key: "animalSupport" }, { path: "/community", key: "community" },
  { path: "/blog", key: "blog" },
];

export const publicDestinations = [
  ["/shop", "فروشگاه", "Shop"],
  ["/vet/find", "دامپزشک", "Find a vet"],
  ["/services", "خدمات", "Services"],
  ["/blog", "وبلاگ و راهنما", "Blog & guides"],
] as const;

export const consumerDestinations = [
  ["/home", "dashboard"], ["/pets", "myPets"], ["/pets/active", "activePet"],
  ["/pets/active?view=health", "health"], ["/pets/active?view=care", "care"],
  ["/care-calendar", "careCalendar"], ["/shop", "shop"], ["/vet/find", "healthAndVet"],
  ["/services", "services"], ["/blog", "blog"], ["/cart", "cart"],
  ["/checkout", "checkout"], ["/orders", "orders"], ["/bookings", "bookings"],
  ["/notifications", "notifications"], ["/notifications/preferences", "notificationPreferences"],
  ["/support", "support"],
] as const;

export function ProductNavigation({ audience = "public" }: { audience?: "public" | "consumer" }) {
  const locale = useLocale(); const t = useTranslations("publicNavigation"); const localizedPath = usePathname() ?? `/${locale}`;
  const pathname = localizedPath.replace(new RegExp(`^/${locale}`), "") || "/";
  if (audience === "consumer") return <nav aria-label={t("productSections")} className="flex flex-wrap gap-1 border-b border-border-subtle px-4 py-2">{consumerDestinations.map(([path, key]) => <Link key={path} href={`/${locale}${path}`} aria-current={!path.includes("?") && (pathname === path || (path !== "/home" && pathname.startsWith(`${path}/`) && !consumerDestinations.some(([other]) => other !== path && !other.includes("?") && other.startsWith(`${path}/`) && (pathname === other || pathname.startsWith(`${other}/`))))) ? "page" : undefined} className="rounded-full px-3 py-2 text-metadata text-text-primary hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2">{t(key)}</Link>)}</nav>;
  return <nav aria-label={t("main")} className="border-b border-border-subtle bg-surface-elevated">
    <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-2 lg:px-8"><section aria-label={t("explore")} className="flex shrink-0 items-center gap-1">
      <span className="me-1 hidden text-[11px] font-semibold uppercase tracking-wide text-text-disabled 2xl:inline">{t("explore")}</span>
      {exploreDestinations.map((item) => { const active = item.match?.(pathname) ?? (pathname === item.path || pathname.startsWith(`${item.path}/`)); return <Link key={item.path} href={`/${locale}${item.path}`} aria-current={active ? "page" : undefined} className="min-h-11 border-b-2 border-transparent px-2.5 py-3 text-metadata whitespace-nowrap text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary aria-[current=page]:border-brand-natural aria-[current=page]:font-semibold aria-[current=page]:text-brand-natural focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{t(item.key)}</Link> })}
    </section></div>
  </nav>;
}

