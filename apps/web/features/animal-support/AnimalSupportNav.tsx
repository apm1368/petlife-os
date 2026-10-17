"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "@/features/navigation/localized-link";

const ITEMS = [
  { href: "/animal-support/needs", fa: "نیازهای باز", en: "Open needs" },
  { href: "/animal-support/campaigns", fa: "کمپین‌ها", en: "Campaigns" },
  { href: "/animal-support", fa: "سازمان‌ها و پناهگاه‌ها", en: "Shelters and NGOs" },
  { href: "/animal-support/my-help", fa: "کمک‌های من", en: "My help" },
] as const;

/** One secondary nav for the animal-support area, so needs, campaigns and organizations are never dead ends from each other. */
export function AnimalSupportNav() {
  const locale = useLocale() === "en" ? "en" : "fa";
  const path = (usePathname() ?? "").replace(/^\/(fa|en)/, "");
  return (
    <nav aria-label={locale === "fa" ? "بخش‌های حمایت از حیوانات" : "Animal support sections"} className="section-tabs">
      {ITEMS.map((item) => {
        const active = item.href === "/animal-support" ? path === "/animal-support" || path.startsWith("/animal-support/organizations") : path.startsWith(item.href);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>{item[locale]}</Link>;
      })}
    </nav>
  );
}
