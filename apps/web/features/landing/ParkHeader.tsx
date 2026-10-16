"use client";
import { Brand } from "@/features/brand/Brand";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X, UserRound, Users } from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { landingCopy } from "./copy";
import { parkCopy } from "./park-copy";

export function ParkHeader({ locale }: { locale: AppLocale }) {
  useSessionBootstrap();
  const signedIn = useSessionStore(s => s.status === "authenticated" && !!s.user);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const c = parkCopy[locale];
  const base = landingCopy[locale];
  const root = `/${locale}`;
  const other = locale === "fa" ? "en" : "fa";
  const links = [
    { href: root, label: c.home },
    { href: `${root}#park-services`, label: base.nav.items[0]!.label },
    { href: `${root}#park-about`, label: c.about },
    { href: `${root}#park-partners`, label: c.partners },
  ];
  return <header className="park-header" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); } }}>
    <a href="#lp-main" className="park-skip">{base.actions.skip}</a>
    <div className="park-header__inner">
      <Link className="park-brand" href={root} aria-label="opetlife">
        <span><Brand /><small>{c.brandTagline}</small></span>
      </Link>
      <nav className="park-desktop-nav" aria-label={base.nav.label}>
        {links.map(link => <Link key={link.href} href={link.href} aria-current={link.href === root ? "page" : undefined}>{link.label}</Link>)}
      </nav>
      <div className="park-header__actions">
        <div className="park-partner-links">
          <Users size={16} aria-hidden="true" />
          <Link href={`${root}/auth?returnTo=${encodeURIComponent(`${root}/provider`)}`}>{c.partnerSignIn}</Link>
          <span aria-hidden="true">/</span>
          <Link href={`${root}/register?returnTo=${encodeURIComponent(`${root}/provider`)}`}>{c.partnerJoin}</Link>
        </div>
        <div className="park-account-links">
          <UserRound size={16} aria-hidden="true" />
          {signedIn ? <Link href={`${root}/home`}>{base.actions.dashboard}</Link> : <>
            <Link href={`${root}/auth`}>{base.actions.signIn}</Link><span aria-hidden="true">/</span>
            <Link href={`${root}/register`}>{c.memberJoin}</Link>
          </>}
        </div>
        <a className="park-language" href={`/${other}`} hrefLang={other} lang={other} aria-label={base.actions.languageLabel}>{other.toUpperCase()}</a>
        <button ref={menuButton} type="button" className="park-menu-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="park-mobile-nav" aria-label={open ? base.nav.close : base.nav.menu}>
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>
    </div>
    <nav id="park-mobile-nav" className="park-mobile-nav" aria-label={base.nav.label} hidden={!open}>
      {links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
      <Link href={`${root}/auth?returnTo=${encodeURIComponent(`${root}/provider`)}`} onClick={() => setOpen(false)}>{c.partnerSignIn}</Link>
      <Link href={`${root}/register?returnTo=${encodeURIComponent(`${root}/provider`)}`} onClick={() => setOpen(false)}>{c.partnerJoin}</Link>
    </nav>
  </header>;
}
