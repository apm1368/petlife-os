"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight, ClipboardList, HeartPulse, House, Images, LifeBuoy, Plane, Receipt } from "@petlife/ui";
import { EXPLORE_GROUPS } from "@/features/navigation/consumer-nav";

type Entry = { href: string; icon: typeof House; fa: [string, string]; en: [string, string] };

const MINE: Entry[] = [
  { href: "/bookings", icon: ClipboardList, fa: ["نوبت‌های من", ""], en: ["My bookings", ""] },
  { href: "/orders", icon: Receipt, fa: ["سفارش‌های من", ""], en: ["My orders", ""] },
  { href: "/travel/trips", icon: Plane, fa: ["سفرهای من", ""], en: ["My trips", ""] },
  { href: "/pets/active?view=memories", icon: Images, fa: ["خاطرات", ""], en: ["Memories", ""] },
  { href: "/pets", icon: HeartPulse, fa: ["حیوانات من", ""], en: ["My pets", ""] },
  { href: "/support", icon: LifeBuoy, fa: ["پشتیبانی", ""], en: ["Support", ""] },
];

export function ExploreView() {
  const locale = useLocale();
  const fa = locale === "fa";
  const Forward = fa ? ChevronLeft : ChevronRight;
  return (
    <div className="explore">
      <header className="page-intro">
        <h1>{fa ? "کاوش" : "Explore"}</h1>
        <p>{fa ? "همهٔ بخش‌های پت‌لایف در یک جا." : "Everything in PET LIFE, in one place."}</p>
      </header>

      <nav aria-label={fa ? "میان‌برهای من" : "My shortcuts"} className="explore-mine">
        {MINE.map(({ href, icon: Icon, fa: f, en }) => (
          <Link key={href} href={`/${locale}${href}`}>
            <Icon size={18} aria-hidden="true" />
            <span>{fa ? f[0] : en[0]}</span>
          </Link>
        ))}
      </nav>

      {EXPLORE_GROUPS.map((group) => (
        <section key={group.key} className="explore-group" aria-labelledby={`explore-${group.key}`}>
          <h2 id={`explore-${group.key}`}>{fa ? group.fa : group.en}</h2>
          <ul>
            {group.links.map(({ href, icon: Icon, fa: f, en }) => (
              <li key={href}>
                <Link href={`/${locale}${href}`} className="explore-row">
                  <span className="explore-row__icon"><Icon size={20} aria-hidden="true" /></span>
                  <span className="explore-row__text">
                    <strong>{fa ? f[0] : en[0]}</strong>
                    <span>{fa ? f[1] : en[1]}</span>
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
