"use client";
import { Brand } from "@/features/brand/Brand";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X, UserRound, Users } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { parkCopy } from "./park-copy";
import { DisplayModeToggle } from "@/features/display-mode/DisplayModeToggle";

export function ParkHeader({ locale }: { locale: RouteLocale }) {
  useSessionBootstrap();
  const signedIn = useSessionStore(s => s.status === "authenticated" && !!s.user);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const c = parkCopy[locale];
  const root = `/${locale}`;
  const languageNames: Record<RouteLocale, string> = { fa: "زبان", en: "Language", de: "Sprache", es: "Idioma" };
  const links = [
    { href: root, label: c.home },
    { href: `${root}#park-services`, label: c.services.vet.title },
    { href: `${root}#park-about`, label: c.about },
    { href: `${root}#park-partners`, label: c.partners },
  ];
  return <header className="park-header" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); } }}>
    <a href="#lp-main" className="park-skip">{c.skip}</a>
    <div className="park-header__inner">
      <Link className="park-brand" href={root} aria-label="opetlife">
        <span><Brand /><small>{c.brandTagline}</small></span>
      </Link>
      <nav className="park-desktop-nav" aria-label={c.navLabel}>
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
          {signedIn ? <Link href={`${root}/home`}>{c.dashboard}</Link> : <>
            <Link href={`${root}/auth`}>{c.signIn}</Link><span className="park-account-separator" aria-hidden="true">/</span>
            <Link className="park-account-join" href={`${root}/register`}>{c.memberJoin}</Link>
          </>}
        </div>
        <label className="sr-only" htmlFor="park-language-select">{languageNames[locale]}</label>
        <select id="park-language-select" className="park-language" aria-label={languageNames[locale]} value={locale} onChange={event => {
          const url = new URL(window.location.href);
          url.pathname = `/${event.target.value}${url.pathname.replace(/^\/(fa|en|de|es)/, "")}`;
          window.location.assign(url.toString());
        }}>
          <option value="fa">فارسی</option><option value="en">English</option><option value="de">Deutsch</option><option value="es">Español</option>
        </select>
        <DisplayModeToggle locale={locale} compact />
        <button ref={menuButton} type="button" className="park-menu-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="park-mobile-nav" aria-label={open ? c.closeMenuLabel : c.menuLabel}>
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>
    </div>
    <nav id="park-mobile-nav" className="park-mobile-nav" aria-label={c.navLabel} hidden={!open}>
      {links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
      <Link href={`${root}/auth`} onClick={() => setOpen(false)}>{c.signIn}</Link>
      <Link href={`${root}/register`} onClick={() => setOpen(false)}>{c.memberJoin}</Link>
      <Link href={`${root}/auth?returnTo=${encodeURIComponent(`${root}/provider`)}`} onClick={() => setOpen(false)}>{c.partnerSignIn}</Link>
      <Link href={`${root}/register?returnTo=${encodeURIComponent(`${root}/provider`)}`} onClick={() => setOpen(false)}>{c.partnerJoin}</Link>
    </nav>
  </header>;
}
