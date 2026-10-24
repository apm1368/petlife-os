import { Brand } from "@/features/brand/Brand";
import Link from "next/link";
import { ArrowUp } from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { storyCopy } from "./story-copy";

export function ParkFooter({ locale }: { locale: AppLocale }) {
  const c = storyCopy[locale];
  return <footer className="park-footer" aria-label={c.footerLabel}>
    <div className="park-footer__main">
      <div className="park-footer__brand">
        <Link href={`/${locale}`} className="park-brand"><Brand /></Link>
        <p>{c.footerDescription}</p>
        <Link href={`/${locale}#lp-main`} className="park-footer__back">{c.footerTop}<ArrowUp size={16} aria-hidden="true" /></Link>
      </div>
      {c.footerGroups.map(group => <nav key={group.title} aria-label={group.title}>
        <h2>{group.title}</h2>
        <ul>{group.links.map(link => <li key={link.href}><Link href={`/${locale}${link.href}`}>{link.label}</Link></li>)}</ul>
      </nav>)}
      <nav aria-label={c.footerPartners}>
        <h2>{c.footerPartners}</h2>
        <ul>
          <li><Link href={`/${locale}/auth?returnTo=${encodeURIComponent(`/${locale}/provider`)}`}>{c.partnerLogin}</Link></li>
          <li><Link href={`/${locale}/register?returnTo=${encodeURIComponent(`/${locale}/provider`)}`}>{c.partnerJoin}</Link></li>
        </ul>
      </nav>
    </div>
    <div className="park-footer__bottom">
      <small>{c.footerNotice}</small>
      <nav aria-label={c.footerPrivacy}>
        <Link href={`/${locale}/profile/privacy`}>{c.footerPrivacy}</Link>
        <Link href={`/${locale}/credits`}>{c.footerCredits}</Link>
      </nav>
    </div>
  </footer>;
}
