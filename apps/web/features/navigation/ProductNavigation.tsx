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

const consumerGroups = [
  { fa: "نمای کلی", en: "Overview", items: [{ path: "/home", fa: "خانه", en: "Home" }, { path: "/pets", fa: "حیوانات من", en: "My pets" }, { path: "/care-calendar", fa: "تقویم مراقبت", en: "Care calendar" }] },
  { fa: "مراقبت حیوان", en: "Pet care", items: [
    { path: "/pets/active", fa: "پروفایل حیوان", en: "Pet profile" }, { path: "/pets/active?view=health", fa: "سلامت", en: "Health", match: petSection("health") },
    { path: "/pets/active?view=care", fa: "مراقبت", en: "Care", match: petSection("care") }, { path: "/pets/active?view=memories", fa: "خاطرات", en: "Memories", match: petSection("memories") },
    { path: "/pets/active?view=travel", fa: "سفر", en: "Travel", match: petSection("travel") },
  ] },
  { fa: "فعالیت‌ها", en: "Activity", items: [{ path: "/bookings", fa: "نوبت‌ها", en: "Bookings" }, { path: "/orders", fa: "سفارش‌ها", en: "Orders" }, { path: "/notifications", fa: "اعلان‌ها", en: "Notifications" }] },
  { fa: "حساب", en: "Account", items: [{ path: "/profile", fa: "پروفایل", en: "Profile" }, { path: "/subscription", fa: "اشتراک", en: "Subscription" }, { path: "/notifications/preferences", fa: "تنظیمات اعلان", en: "Notification preferences" }, { path: "/support", fa: "پشتیبانی", en: "Support" }] },
] satisfies { fa: string; en: string; items: NavigationItem[] }[];

function isActive(item: NavigationItem, pathname: string) {
  if (item.match) return item.match(pathname);
  const itemPath = item.path.split("?")[0];
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function ProductNavigation({ audience = "public" }: { audience?: "public" | "consumer" }) {
  const locale = useLocale(); const localizedPath = usePathname() ?? `/${locale}`;
  const pathname = localizedPath.replace(new RegExp(`^/${locale}`), "") || "/";
  const groups = audience === "consumer" ? consumerGroups : [{ fa: "کاوش", en: "Explore", items: exploreDestinations }];
  return <nav aria-label={locale === "fa" ? "ناوبری محصول" : "Product navigation"} className="border-b border-border-subtle bg-surface-elevated">
    <div className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-2 lg:px-8">{groups.map((group) => <section key={group.en} aria-label={locale === "fa" ? group.fa : group.en} className="flex shrink-0 items-center gap-1">
      <span className="me-1 hidden text-[11px] font-semibold uppercase tracking-wide text-text-disabled 2xl:inline">{locale === "fa" ? group.fa : group.en}</span>
      {group.items.map((item) => { const active = isActive(item, pathname); return <Link key={item.path} href={`/${locale}${item.path}`} aria-current={active ? "page" : undefined} className="min-h-11 border-b-2 border-transparent px-2.5 py-3 text-metadata whitespace-nowrap text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary aria-[current=page]:border-brand-natural aria-[current=page]:font-semibold aria-[current=page]:text-brand-natural focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{locale === "fa" ? item.fa : item.en}</Link> })}
    </section>)}</div>
  </nav>;
}

