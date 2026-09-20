"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

export type NavigationItem = { path: string; fa: string; en: string; match?: (pathname: string) => boolean };
const inPath = (value: string) => (pathname: string) => pathname === value || pathname.startsWith(`${value}/`);
const petSection = (section: string) => (pathname: string) => new RegExp(`/pets/[^/]+/${section}(?:/|$)`).test(pathname);

export const globalDestinations: NavigationItem[] = [
  { path: "/", fa: "خانه", en: "Home", match: (pathname) => pathname === "/" },
  { path: "/vet/find", fa: "سلامت", en: "Health", match: (pathname) => inPath("/vet")(pathname) || petSection("health")(pathname) },
  { path: "/services", fa: "خدمات", en: "Services", match: (pathname) => inPath("/services")(pathname) || inPath("/bookings")(pathname) },
  { path: "/shop", fa: "فروشگاه", en: "Shop", match: (pathname) => inPath("/shop")(pathname) || inPath("/cart")(pathname) || inPath("/checkout")(pathname) || inPath("/orders")(pathname) },
  { path: "/pets/active?view=memories", fa: "خاطرات", en: "Memories", match: petSection("memories") },
];

export const exploreDestinations: NavigationItem[] = [
  { path: "/vet/find", fa: "سلامت و دامپزشکی", en: "Health & vet" }, { path: "/services", fa: "خدمات", en: "Services" },
  { path: "/shop", fa: "فروشگاه", en: "Shop" }, { path: "/places", fa: "مکان‌ها", en: "Places" },
  { path: "/pets/active?view=travel", fa: "سفر", en: "Travel" }, { path: "/insurance", fa: "بیمه", en: "Insurance" },
  { path: "/animal-support", fa: "حمایت از حیوانات", en: "Animal support" }, { path: "/community", fa: "جامعه", en: "Community" },
  { path: "/blog", fa: "راهنماها", en: "Guides" },
];

export const publicDestinations = [
  ["/shop", "فروشگاه", "Shop"],
  ["/vet/find", "دامپزشک", "Find a vet"],
  ["/services", "خدمات", "Services"],
  ["/blog", "وبلاگ و راهنما", "Blog & guides"],
] as const;

export const consumerDestinations = [
  ["/home", "خانه", "Home"],
  ["/pets", "حیوانات من", "My pets"],
  ["/pets/active", "حیوان فعال", "Active pet"],
  ["/pets/active?view=health", "سلامت", "Health"],
  ["/pets/active?view=care", "مراقبت", "Care"],
  ["/care-calendar", "تقویم مراقبت", "Care calendar"],
  ...publicDestinations,
  ["/cart", "سبد خرید", "Cart"],
  ["/checkout", "پرداخت", "Checkout"],
  ["/orders", "سفارش‌ها", "Orders"],
  ["/bookings", "نوبت‌ها", "Bookings"],
  ["/notifications", "اعلان‌ها", "Notifications"],
  ["/notifications/preferences", "تنظیمات اعلان", "Notification preferences"],
  ["/support", "پشتیبانی", "Support"],
] as const;


function isActive(item: NavigationItem, pathname: string) {
  if (item.match) return item.match(pathname);
  const itemPath = item.path.split("?")[0];
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function ProductNavigation({ audience = "public" }: { audience?: "public" | "consumer" }) {
  const locale = useLocale(); const localizedPath = usePathname() ?? `/${locale}`;
  const pathname = localizedPath.replace(new RegExp(`^/${locale}`), "") || "/";
  if (audience === "consumer") return <nav aria-label={locale === "fa" ? "بخش‌های محصول" : "Product sections"} className="flex flex-wrap gap-1 border-b border-border-subtle px-4 py-2">{consumerDestinations.map(([path, fa, en]) => <Link key={path} href={`/${locale}${path}`} className="rounded-full px-3 py-2 text-metadata text-text-primary hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2">{locale === "fa" ? fa : en}</Link>)}</nav>;
  const groups = [{ fa: "کاوش", en: "Explore", items: exploreDestinations }];
  return <nav aria-label={locale === "fa" ? "ناوبری محصول" : "Product navigation"} className="border-b border-border-subtle bg-surface-elevated">
    <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-2 lg:px-8">{groups.map((group) => <section key={group.en} aria-label={locale === "fa" ? group.fa : group.en} className="flex shrink-0 items-center gap-1">
      <span className="me-1 hidden text-[11px] font-semibold uppercase tracking-wide text-text-disabled 2xl:inline">{locale === "fa" ? group.fa : group.en}</span>
      {group.items.map((item) => { const active = isActive(item, pathname); return <Link key={item.path} href={`/${locale}${item.path}`} aria-current={active ? "page" : undefined} className="min-h-11 border-b-2 border-transparent px-2.5 py-3 text-metadata whitespace-nowrap text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary aria-[current=page]:border-brand-natural aria-[current=page]:font-semibold aria-[current=page]:text-brand-natural focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{locale === "fa" ? item.fa : item.en}</Link> })}
    </section>)}</div>
  </nav>;
}

