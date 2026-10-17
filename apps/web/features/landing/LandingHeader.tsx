"use client";
import { Brand } from "@/features/brand/Brand";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconButton, Menu, Sheet, X } from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import type { LandingCopy } from "./copy";

/**
 * Landing header. Brand at the reading start; navigation and account actions at the end —
 * which on Persian desktop puts the main navigation on the left, as the owner decided.
 * Language and theme are independent controls. A signed-in visitor gets "My dashboard"
 * instead of the sign-in pair.
 */
export function LandingHeader({ locale, copy }: { locale: AppLocale; copy: LandingCopy }) {
  useSessionBootstrap();
  const signedIn = useSessionStore((s) => s.status === "authenticated" && !!s.user);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const other = locale === "fa" ? "en" : "fa";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const account = signedIn ? (
    <Link className="lp-btn lp-btn--primary lp-btn--sm" href={`/${locale}/home`}>{copy.actions.dashboard}</Link>
  ) : (
    <>
      <Link className="lp-btn lp-btn--quiet lp-btn--sm" href={`/${locale}/auth`}>{copy.actions.signIn}</Link>
      <Link className="lp-btn lp-btn--primary lp-btn--sm" href={`/${locale}/register`}>{copy.actions.start}</Link>
    </>
  );

  return (
    <header className="lp-header" data-scrolled={scrolled}>
      <a className="lp-skip" href="#lp-main">{copy.actions.skip}</a>
      <div className="lp-header__inner">
        <Link href={`/${locale}`} className="lp-brand" aria-label="opetlife">
          <Brand />
        </Link>
        <nav aria-label={copy.nav.label} className="lp-nav">
          {copy.nav.items.map((item) => (
            <Link key={item.href} href={`/${locale}${item.href}`}>{item.label}</Link>
          ))}
        </nav>
        <div className="lp-header__tools">
          <div className="lp-header__prefs">
            <a className="lp-lang" href={`/${other}`} hrefLang={other} lang={other} aria-label={copy.actions.languageLabel}>{copy.actions.language}</a>
            <ThemeToggle />
          </div>
          <div className="lp-header__account">{account}</div>
          <div className="lp-header__menu">
            <IconButton label={copy.nav.menu} onClick={() => setOpen(true)} aria-expanded={open} icon={<Menu size={20} aria-hidden="true" />} />
          </div>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.nav.label}>
        <div className="flex justify-end">
          <IconButton label={copy.nav.close} onClick={() => setOpen(false)} icon={<X size={20} aria-hidden="true" />} />
        </div>
        <nav aria-label={copy.nav.label} className="lp-sheet-nav">
          {copy.nav.items.map((item) => (
            <Link key={item.href} href={`/${locale}${item.href}`} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
        </nav>
        <div className="lp-sheet-prefs">
          <a className="lp-lang" href={`/${other}`} hrefLang={other} lang={other} aria-label={copy.actions.languageLabel}>{copy.actions.language}</a>
          <ThemeToggle />
        </div>
        <div className="lp-sheet-actions">{account}</div>
      </Sheet>
    </header>
  );
}
