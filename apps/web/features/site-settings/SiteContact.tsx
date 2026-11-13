"use client";

import { useLocale, useTranslations } from "next-intl";
import { Mail, Phone, MapPin, Clock3 } from "@petlife/ui";
import { localizedSetting, useSiteSettings } from "./site-settings";
import { SocialIcon } from "./SocialIcons";
import { visibleSocialLinks, type SocialNetwork } from "./public-links";
import type { PublicPlatformSettings } from "@/services/platform-settings.service";

/**
 * The admin's social links in footer order (X3's rule: link set and the network's switch not off), plus a client-side
 * https check as a second line of defence behind the API's host allowlist.
 */
export function socialLinks(settings: PublicPlatformSettings | null): { network: SocialNetwork; url: string }[] {
  return visibleSocialLinks(settings).flatMap(({ network, href }) => (/^https:\/\/[^\s"'<>]+$/i.test(href) ? [{ network, url: href }] : []));
}

/**
 * Social profile icons (owner, 2026-11-13): plain links with in-house monochrome icons, no embeds, scripts or remote
 * images (the privacy policy promises no social-media tracking). Renders nothing until at least one is set.
 */
export function SocialLinks({ className = "", title }: { className?: string; title?: string }) {
  const t = useTranslations("siteSettings");
  const links = socialLinks(useSiteSettings());
  if (!links.length) return null;
  const list = (
    <ul className={`site-social ${className}`} aria-label={title ?? t("social")}>
      {links.map(({ network, url }) => (
        <li key={network}>
          <a href={url} rel="noopener noreferrer me" target="_blank" aria-label={t(`networks.${network}`)} title={t(`networks.${network}`)}>
            <SocialIcon network={network} />
          </a>
        </li>
      ))}
    </ul>
  );
  return title ? (
    <section className="site-social-block" aria-label={title}>
      <h2>{title}</h2>
      {list}
    </section>
  ) : list;
}

/** Contact facts set by admins (site.contact*, site.workingHours). Renders nothing until one is set. */
export function SiteContact({ variant = "footer" }: { variant?: "footer" | "page" }) {
  const t = useTranslations("siteSettings");
  const locale = useLocale();
  const settings = useSiteSettings();
  if (!settings) return null;
  const email = settings["site.contactEmail"];
  const phone = settings["site.contactPhone"];
  const address = localizedSetting(settings["site.contactAddress"], locale);
  const hours = localizedSetting(settings["site.workingHours"], locale);
  if (!email && !phone && !address && !hours) return null;
  return (
    <address className={`site-contact site-contact--${variant}`} aria-label={t("contact")}>
      {phone ? <p><Phone size={16} aria-hidden="true" /><a href={`tel:${phone.replace(/[^+0-9]/g, "")}`}><bdi dir="ltr">{phone}</bdi></a>{hours ? <span className="site-contact__hint"> · {hours}</span> : null}</p> : hours ? <p><Clock3 size={16} aria-hidden="true" />{hours}</p> : null}
      {email ? <p><Mail size={16} aria-hidden="true" /><a href={`mailto:${email}`}><bdi dir="ltr">{email}</bdi></a></p> : null}
      {address ? <p><MapPin size={16} aria-hidden="true" /><span>{address}</span></p> : null}
    </address>
  );
}

/** Footer tagline and note (site.tagline, site.footerNote). */
export function SiteFooterNote() {
  const locale = useLocale();
  const settings = useSiteSettings();
  const tagline = localizedSetting(settings?.["site.tagline"], locale);
  const note = localizedSetting(settings?.["site.footerNote"], locale);
  if (!tagline && !note) return null;
  return (
    <div className="site-footer-note">
      {tagline ? <p className="site-footer-note__tagline">{tagline}</p> : null}
      {note ? <p className="site-footer-note__text">{note}</p> : null}
    </div>
  );
}
