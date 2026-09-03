"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

export const publicDestinations = [
  ["/shop", "فروشگاه", "Shop"],
  ["/vet/find", "دامپزشک", "Find a vet"],
  ["/services", "خدمات", "Services"],
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

export function ProductNavigation({ audience = "public" }: { audience?: "public" | "consumer" }) {
  const locale = useLocale();
  const items = audience === "consumer" ? consumerDestinations : publicDestinations;
  return (
    <nav aria-label={locale === "fa" ? "بخش‌های محصول" : "Product sections"}
      className="flex flex-wrap gap-1 border-b border-border-subtle px-4 py-2">
      {items.map(([path, fa, en]) => (
        <Link key={path} href={`/${locale}${path}`}
          className="rounded-full px-3 py-2 text-metadata text-text-primary hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2">
          {locale === "fa" ? fa : en}
        </Link>
      ))}
    </nav>
  );
}
