"use client";

import { useLocale, useTranslations } from "next-intl";
import { Mail, Phone, MapPin, Clock3 } from "@petlife/ui";
import { localizedSetting, useSiteSettings } from "./site-settings";

const SOCIAL = ["instagram", "telegram", "whatsapp", "x", "linkedin", "youtube", "aparat"] as const;

/** Social profile links set by admins (social.*). Renders nothing until at least one is set. */
export function SocialLinks({ className = "" }: { className?: string }) {
  const t = useTranslations("siteSettings");
  const settings = useSiteSettings();
  if (!settings) return null;
  const links = SOCIAL.map((key) => ({ key, url: settings[`social.${key}`] })).filter((l): l is { key: (typeof SOCIAL)[number]; url: string } => typeof l.url === "string" && l.url.length > 0);
  if (!links.length) return null;
  return (
    <ul className={`site-social ${className}`} aria-label={t("social")}>
      {links.map((l) => (
        <li key={l.key}><a href={l.url} rel="noopener noreferrer me" target="_blank">{t(`networks.${l.key}`)}</a></li>
      ))}
    </ul>
  );
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
