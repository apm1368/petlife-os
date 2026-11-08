"use client";
import { Brand } from "@/features/brand/Brand";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { landingCopy } from "@/features/landing/copy";

/** Public footer — the same real destinations as the landing footer; no placeholder labels. */
export function PublicFooter() {
  const t = useTranslations("rollout.contact");
  const locale = useLocale() === "fa" ? "fa" : "en";
  const copy = landingCopy[locale].footer;
  return (
    <footer className="public-footer" aria-label={locale === "fa" ? "پیوندهای پایانی" : "Footer links"}>
      <div className="public-footer__brand">
        <Brand />
        <span>{copy.demo}</span>
      </div>
      <ul>
        <li><Link href={`/${locale}/contact`}>{t("link")}</Link></li>
        <li><Link href={`/${locale}/help`}>{locale === "fa" ? "مرکز راهنما" : "Help Center"}</Link></li>
        <li><Link href={`/${locale}/legal`}>{locale === "fa" ? "اسناد و سیاست‌ها" : "Policies & Legal"}</Link></li>
        <li><Link href={`/${locale}/status`}>{locale === "fa" ? "وضعیت سامانه" : "System status"}</Link></li>
        {copy.groups.flatMap((group) => group.links).map((link) => (
          <li key={link.href}><Link href={`/${locale}${link.href}`}>{link.label}</Link></li>
        ))}
      </ul>
    </footer>
  );
}
