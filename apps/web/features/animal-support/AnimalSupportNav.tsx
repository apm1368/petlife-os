"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "@/features/navigation/localized-link";

const ITEMS = [
  { href: "/animal-support/needs", fa: "نیازهای باز", en: "Open needs", de: "Offene Bedarfe", es: "Necesidades abiertas", ar: "احتياجات مفتوحة", nl: "Open behoeften" },
  { href: "/animal-support/campaigns", fa: "کمپین‌ها", en: "Campaigns", de: "Kampagnen", es: "Campañas", ar: "الحملات", nl: "Campagnes" },
  { href: "/animal-support", fa: "سازمان‌ها و پناهگاه‌ها", en: "Shelters and NGOs", de: "Tierheime und Organisationen", es: "Refugios y organizaciones", ar: "الملاجئ والمنظمات غير الحكومية", nl: "Asielen en ngo's" },
  { href: "/animal-support/my-help", fa: "کمک‌های من", en: "My help", de: "Meine Hilfe", es: "Mi ayuda", ar: "مساعداتي", nl: "Mijn hulp" },
] as const;
const NAV_LABEL = { fa: "بخش‌های حمایت از حیوان", en: "Animal support sections", de: "Bereiche der Tierhilfe", es: "Secciones de ayuda animal", ar: "أقسام دعم الحيوانات", nl: "Onderdelen dierenhulp" } as const;

/** One secondary nav for the animal-support area, so needs, campaigns and organizations are never dead ends from each other. */
export function AnimalSupportNav() {
  const raw = useLocale();
  const locale = (raw === "fa" || raw === "de" || raw === "es" ? raw : "en") as keyof typeof NAV_LABEL;
  const path = (usePathname() ?? "").replace(/^\/(fa|en|de|es)/, "");
  return (
    <nav aria-label={NAV_LABEL[locale]} className="section-tabs">
      {ITEMS.map((item) => {
        const active = item.href === "/animal-support" ? path === "/animal-support" || path.startsWith("/animal-support/organizations") : path.startsWith(item.href);
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>{item[locale]}</Link>;
      })}
    </nav>
  );
}
