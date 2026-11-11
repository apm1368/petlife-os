"use client";

import Link from "next/link";
import { ArrowUp } from "@petlife/ui";
import { FooterLinkGroup, FooterSiteDetails } from "@/features/site-settings/FooterLinks";
import { Brand } from "@/features/brand/Brand";
import { storyCopy } from "@/features/landing/story-copy";
import type { RouteLocale } from "@/lib/i18n/config";
import "./public-footer.css";

/** Public-route counterpart to the landing footer, sharing its translated copy and destinations. */
export function PublicFooter({ locale }: { locale: RouteLocale }) {
  const copy = storyCopy[locale];
  return <footer className="park-footer public-route-footer" aria-label={copy.footerLabel}>
    <div className="park-footer__main">
      <div className="park-footer__brand">
        <Link href={`/${locale}`} className="park-brand"><Brand /></Link>
        <p>{copy.footerDescription}</p>
        <FooterSiteDetails />
        <Link href={`/${locale}#lp-main`} className="park-footer__back">{copy.footerTop}<ArrowUp size={16} aria-hidden="true" /></Link>
      </div>
      {copy.footerGroups.map((group) => <FooterLinkGroup key={group.title} title={group.title} links={group.links} locale={locale} />)}
      <nav aria-label={copy.footerPartners}>
        <h2>{copy.footerPartners}</h2>
        <ul>
          <li><Link href={`/${locale}/auth?returnTo=${encodeURIComponent(`/${locale}/provider`)}`}>{copy.partnerLogin}</Link></li>
          <li><Link href={`/${locale}/register?returnTo=${encodeURIComponent(`/${locale}/provider`)}`}>{copy.partnerJoin}</Link></li>
        </ul>
      </nav>
    </div>
    <div className="park-footer__bottom">
      <small>{copy.footerNotice}</small>
      <nav aria-label={copy.footerPrivacy}>
        <Link href={`/${locale}/profile/privacy`}>{copy.footerPrivacy}</Link>
        <Link href={`/${locale}/credits`}>{copy.footerCredits}</Link>
      </nav>
    </div>
  </footer>;
}
