import { Brand } from "@/features/brand/Brand";
import Link from "next/link";
import { ArrowUp } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { storyCopy } from "./story-copy";
import { CookieToggle } from "./opl/CookieToggle";

export function ParkFooter({ locale }: { locale: RouteLocale }) {
  const c = storyCopy[locale];
  return <footer className="opl-foot" aria-label={c.footerLabel}>
    <div className="opl-wrap">
      <div className="opl-foot__grid">
        <div className="opl-foot__brand">
          <Link href={`/${locale}`} className="opl-brand"><Brand locale={locale} /></Link>
          <p>{c.footerDescription}</p>
          <Link href={`/${locale}#lp-main`} className="opl-foot__back">{c.footerTop}<ArrowUp size={16} aria-hidden="true" /></Link>
        </div>
        {c.footerGroups.map((group) => <nav key={group.title} aria-label={group.title}>
          <h2>{group.title}</h2>
          <ul>{group.links.map((link) => <li key={link.href}><Link href={`/${locale}${link.href}`}>{link.label}</Link></li>)}</ul>
        </nav>)}
        <nav aria-label={c.footerPartners}>
          <h2>{c.footerPartners}</h2>
          <ul>
            <li><Link href={`/${locale}/auth?returnTo=${encodeURIComponent(`/${locale}/provider`)}`}>{c.partnerLogin}</Link></li>
            <li><Link href={`/${locale}/register?returnTo=${encodeURIComponent(`/${locale}/provider`)}`}>{c.partnerJoin}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="opl-foot__bottom">
        <CookieToggle />
        <nav aria-label={c.footerPrivacy}>
          <Link href={`/${locale}/profile/privacy`}>{c.footerPrivacy}</Link>
          <Link href={`/${locale}/credits`}>{c.footerCredits}</Link>
        </nav>
      </div>
    </div>
  </footer>;
}
