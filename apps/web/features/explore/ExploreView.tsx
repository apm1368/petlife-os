"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, ClipboardList, HeartPulse, House, Images, LifeBuoy, PackageCheck, Plane } from "@petlife/ui";
import { EXPLORE_GROUPS } from "@/features/navigation/consumer-nav";
import type { RouteLocale } from "@/lib/i18n/config";

type Entry = { href: string; icon: typeof House; fa: [string, string]; en: [string, string]; de: [string, string]; es: [string, string] };

const MINE: Entry[] = [
  { href: "/bookings", icon: ClipboardList, fa: ["نوبت‌های من", ""], en: ["My bookings", ""], de: ["Meine Termine", ""], es: ["Mis citas", ""] },
  { href: "/orders", icon: PackageCheck, fa: ["سفارش‌های من", ""], en: ["My orders", ""], de: ["Meine Bestellungen", ""], es: ["Mis pedidos", ""] },
  { href: "/travel/trips", icon: Plane, fa: ["سفرهای من", ""], en: ["My trips", ""], de: ["Meine Reisen", ""], es: ["Mis viajes", ""] },
  { href: "/pets/active?view=memories", icon: Images, fa: ["خاطرات", ""], en: ["Memories", ""], de: ["Erinnerungen", ""], es: ["Recuerdos", ""] },
  { href: "/pets", icon: HeartPulse, fa: ["حیوانات من", ""], en: ["My pets", ""], de: ["Meine Tiere", ""], es: ["Mis mascotas", ""] },
  { href: "/support", icon: LifeBuoy, fa: ["پشتیبانی", ""], en: ["Support", ""], de: ["Support", ""], es: ["Soporte", ""] },
];

const COPY: Record<RouteLocale, { title: string; description: string; shortcuts: string }> = {
  fa: { title: "کاوش", description: "همهٔ بخش‌های opetlife در یک جا.", shortcuts: "میان‌برهای من" },
  en: { title: "Explore", description: "Everything in opetlife, in one place.", shortcuts: "My shortcuts" },
  de: { title: "Entdecken", description: "Alle Bereiche von opetlife an einem Ort.", shortcuts: "Meine Schnellzugriffe" },
  es: { title: "Explorar", description: "Todo opetlife en un solo lugar.", shortcuts: "Mis accesos directos" },
};

export function ExploreView() {
  const locale = useLocale() as RouteLocale;
  const fa = locale === "fa";
  const copy = COPY[locale];
  const Forward = fa ? ChevronLeft : ChevronRight;
  return (
    <div className="explore">
      <header className="page-intro">
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      <nav aria-label={copy.shortcuts} className="explore-mine">
        {MINE.map(({ href, icon: Icon, ...labels }) => (
          <Link key={href} href={`/${locale}${href}`}>
            <Icon size={18} aria-hidden="true" />
            <span>{labels[locale][0]}</span>
          </Link>
        ))}
      </nav>

      {EXPLORE_GROUPS.map((group) => (
        <section key={group.key} className="explore-group" aria-labelledby={`explore-${group.key}`}>
          <h2 id={`explore-${group.key}`}>{group[locale]}</h2>
          <ul>
            {group.links.map(({ href, icon: Icon, ...labels }) => (
              <li key={href}>
                <Link href={`/${locale}${href}`} className="explore-row">
                  <span className="explore-row__icon"><Icon size={20} aria-hidden="true" /></span>
                  <span className="explore-row__text">
                    <strong>{labels[locale][0]}</strong>
                    <span>{labels[locale][1]}</span>
                  </span>
                  <Forward size={18} aria-hidden="true" className="explore-row__chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
