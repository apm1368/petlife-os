"use client";

import { useLocale, useTranslations } from "next-intl";
import { Mail, Phone, MapPin, Clock3 } from "@petlife/ui";
import { localizedSetting, useSiteSettings } from "./site-settings";
import { SOCIAL_NETWORKS, SocialIcon, type SocialNetwork } from "./SocialIcons";
import type { SocialSettings } from "./social-settings";

/** The admin's social links (social.*): shown when the network's switch is not off and its https link is set. */
export function socialLinks(settings: SocialSettings | null): { network: SocialNetwork; url: string }[] {
  if (!settings) return [];
  return SOCIAL_NETWORKS.flatMap((network) => {
    const url = settings[`social.${network}`];
    const on = settings[`social.${network}Enabled`] !== false;
    return on && typeof url === "string" && /^https:\/\/[^\s"'<>]+$/i.test(url) ? [{ network, url }] : [];
  });
}

/**
 * Social profile icons (owner, 2026-11-13): plain links with in-house monochrome icons, no embeds, scripts or remote
 * images (the privacy policy promises no social-media tracking). Renders nothing until at least one is set.
 */
export function SocialLinks({ className = "", title }: { className?: string; title?: string }) {
  const t = useTranslations("siteSettings");
  const links = socialLinks(useSiteSettings() as SocialSettings | null);
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
