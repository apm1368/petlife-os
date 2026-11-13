import { Brand } from "@/features/brand/Brand";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUp } from "@petlife/ui";
import { FooterLinkGroup, FooterSiteDetails } from "@/features/site-settings/FooterLinks";
import type { RouteLocale } from "@/lib/i18n/config";
import { storyCopy } from "./story-copy";
import { CookieToggle } from "./opl/CookieToggle";
import { localeHomePath } from "@/lib/seo/site";

export function ParkFooter({ locale }: { locale: RouteLocale }) {
  const c = storyCopy[locale];
  const park = useTranslations("pattern2026.park");
  return <footer className="opl-foot" aria-label={c.footerLabel}>
    <div className="opl-wrap">
      <div className="opl-foot__grid">
        <div className="opl-foot__brand">
          <Link href={localeHomePath(locale)} className="opl-brand"><Brand locale={locale} /></Link>
          <p>{c.footerDescription}</p>
          <FooterSiteDetails />
          <Link href={`/${locale}#lp-main`} className="opl-foot__back">{c.footerTop}<ArrowUp size={16} aria-hidden="true" /></Link>
        </div>
        {c.footerGroups.map((group) => <FooterLinkGroup key={group.title} title={group.title} links={group.links} locale={locale} />)}
        <nav aria-label={c.footerPartners}>
          <h2>{c.footerPartners}</h2>
          <ul>
            <li><Link href={`/${locale}/auth?returnTo=${encodeURIComponent(`/${locale}/provider`)}`}>{c.partnerLogin}</Link></li>
            <li><Link href={`/${locale}/partners/join`}>{c.partnerJoin}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="opl-foot__bottom">
        <CookieToggle />
        <nav aria-label={c.footerPrivacy}>
          <Link href={`/${locale}/about`}>{park("about")}</Link>
          <Link href={`/${locale}/profile/privacy`}>{c.footerPrivacy}</Link>
          <Link href={`/${locale}/credits`}>{c.footerCredits}</Link>
        </nav>
      </div>
    </div>
  </footer>;
}
