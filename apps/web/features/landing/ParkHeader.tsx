"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, HeartPulse, Menu, Plane, ShieldCheck, ShoppingBag, Sparkles, Users, X } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { Brand } from "@/features/brand/Brand";
import { useSessionBootstrap } from "@/hooks/use-session-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { DisplayModeToggle } from "@/features/display-mode/DisplayModeToggle";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { parkCopy } from "./park-copy";
import { oplCopy, worldOrder } from "./opl/opl-copy";

const WORLD_ICONS = { health: HeartPulse, daily: ShoppingBag, travel: Plane, safe: ShieldCheck, together: Users } as const;

/** The shared light glass header (pattern-2026-11, Header): logo, the five-question services menu, language and soft buttons. */
export function ParkHeader({ locale }: { locale: RouteLocale }) {
  useSessionBootstrap();
  const signedIn = useSessionStore((s) => s.status === "authenticated" && !!s.user);
  const [open, setOpen] = useState(false);
  const [dd, setDd] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const ddWrap = useRef<HTMLDivElement>(null);
  const c = parkCopy[locale];
  const o = oplCopy[locale];
  const root = `/${locale}`;
  const partnerReturn = encodeURIComponent(`${root}/provider`);
  const languageNames: Record<RouteLocale, string> = { fa: "زبان", en: "Language", de: "Sprache", es: "Idioma" };
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onClick = (e: MouseEvent) => { if (!ddWrap.current?.contains(e.target as Node)) setDd(false); };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick);
    return () => { removeEventListener("scroll", onScroll); document.removeEventListener("click", onClick); };
  }, []);
  const links = [
    { href: `${root}/vet/find`, label: c.services.vet.title },
    { href: `${root}#park-about`, label: c.about },
    { href: `${root}#park-partners`, label: c.partners },
  ];
  return <header className={`opl-hdr${scrolled ? " scrolled" : ""}`} onKeyDown={(event) => { if (event.key === "Escape") { setDd(false); if (open) { setOpen(false); menuButton.current?.focus(); } } }}>
    <a href="#lp-main" className="opl-skip">{c.skip}</a>
    <div className="opl-wrap opl-hdr__in">
      <Link className="opl-brand" href={root} aria-label={o.brand}>
        <Brand locale={locale} /><small>{c.brandTagline}</small>
      </Link>
      <nav className="opl-hnav" aria-label={c.navLabel}>
        <Link href={root} aria-current="page" className="on">{c.home}</Link>
        <div ref={ddWrap} className="opl-hnav__dd">
          <button type="button" aria-expanded={dd} aria-controls="opl-services-menu" onClick={() => setDd((v) => !v)}>{o.header.services}<ChevronDown size={16} aria-hidden="true" /></button>
          <div id="opl-services-menu" className="opl-dd" hidden={!dd}>
            {worldOrder.map((key) => { const Icon = WORLD_ICONS[key], w = o.world.worlds[key]; return <Link key={key} href={`${root}#world-${key}`} onClick={() => setDd(false)}>
              <span className="opl-dd__ic"><Icon size={20} aria-hidden="true" /></span><span><b>{w.name}</b><small>{w.q}</small></span>
            </Link>; })}
            <Link href={`${root}/services`} onClick={() => setDd(false)}><span className="opl-dd__ic"><Sparkles size={20} aria-hidden="true" /></span><span><b>{o.header.allServices}</b><small>{o.header.allServicesHint}</small></span></Link>
          </div>
        </div>
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="opl-hact">
        <label className="sr-only" htmlFor="park-language-select">{languageNames[locale]}</label>
        <select id="park-language-select" className="opl-lang" aria-label={languageNames[locale]} value={locale} onChange={(event) => {
          const url = new URL(window.location.href);
          url.pathname = `/${event.target.value}${url.pathname.replace(/^\/(fa|en|de|es)/, "")}`;
          window.location.assign(url.toString());
        }}>
          <option value="fa">فارسی</option><option value="en">English</option><option value="de">Deutsch</option><option value="es">Español</option>
        </select>
        <span className="opl-hact__theme hide-sm"><ThemeToggle /></span>
        <span className="hide-sm"><DisplayModeToggle locale={locale} compact /></span>
        <Link className="opl-btn line sm hide-sm" href={`${root}/auth?returnTo=${partnerReturn}`}>{c.partnerSignIn}</Link>
        {signedIn ? <Link className="opl-btn primary sm" href={`${root}/home`}>{c.dashboard}</Link> : <>
          <Link className="opl-btn soft sm hide-sm" href={`${root}/auth`}>{c.signIn}</Link>
          <Link className="opl-btn primary sm hide-xs" href={`${root}/register`}>{c.memberJoin}</Link>
        </>}
        <button ref={menuButton} type="button" className="opl-iconbtn opl-hmenu" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="park-mobile-nav" aria-label={open ? c.closeMenuLabel : c.menuLabel}>
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>
    </div>
    <nav id="park-mobile-nav" className="opl-msheet" aria-label={c.navLabel} hidden={!open}>
      <div className="opl-wrap opl-msheet__in">
        {[{ href: root, label: c.home }, ...links].map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>)}
        {worldOrder.map((key) => <Link key={key} href={`${root}#world-${key}`} onClick={() => setOpen(false)}>{o.world.worlds[key].name}</Link>)}
        <Link href={`${root}/auth`} onClick={() => setOpen(false)}>{c.signIn}</Link>
        <Link href={`${root}/register`} onClick={() => setOpen(false)}>{c.memberJoin}</Link>
        <Link href={`${root}/auth?returnTo=${partnerReturn}`} onClick={() => setOpen(false)}>{c.partnerSignIn}</Link>
        <Link href={`${root}/register?returnTo=${partnerReturn}`} onClick={() => setOpen(false)}>{c.partnerJoin}</Link>
        <div className="opl-msheet__tools"><ThemeToggle /><DisplayModeToggle locale={locale} compact /></div>
      </div>
    </nav>
  </header>;
}
