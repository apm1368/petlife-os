"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { landingCopy } from "@/features/landing/copy";

/** Public footer — the same real destinations as the landing footer; no placeholder labels. */
export function PublicFooter() {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const copy = landingCopy[locale].footer;
  return (
    <footer className="public-footer" aria-label={locale === "fa" ? "پیوندهای پایانی" : "Footer links"}>
      <div className="public-footer__brand">
        <bdi className="font-semibold">PET LIFE OS</bdi>
        <span>{copy.demo}</span>
      </div>
      <ul>
        {copy.groups.flatMap((group) => group.links).map((link) => (
          <li key={link.href}><Link href={`/${locale}${link.href}`}>{link.label}</Link></li>
        ))}
      </ul>
    </footer>
  );
}
