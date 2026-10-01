"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, HandHeart, HeartPulse, MapPin, Plane, Scissors, ShieldPlus, ShoppingBag, Siren, Users } from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { DESTINATIONS, MORE_LINKS, landingCopy, type DestinationKey } from "./copy";
import { BUILDINGS, BuildingTile, TehranScene, WORLD } from "./TehranScene";
import { LandingTheme } from "./LandingTheme";

const ICONS: Record<DestinationKey, typeof HeartPulse> = { health: HeartPulse, services: Scissors, shop: ShoppingBag, travel: Plane, animalSupport: HandHeart, community: Users };
const MORE_ICONS = { lostPets: Siren, places: MapPin, insurance: ShieldPlus, guides: BookOpen } as const;

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/**
 * The public landing page. The city is the navigation: each foreground building is one real PET LIFE
 * destination, entered through the sign at its door. On desktop the links lie over the drawing (the whole
 * building is the hit area); on phones the skyline stays as a band and the same links become a vertical
 * list of building tiles. The scene mirrors with the reading direction, so the first destination always
 * stands at the reading start.
 */
export function TehranLanding({ locale }: { locale: AppLocale }) {
  const copy = landingCopy[locale];
  const [active, setActive] = useState<DestinationKey | null>(null);
  const Chevron = locale === "fa" ? ChevronLeft : ChevronRight;

  return (
    <div className="tehran" data-active={active ?? undefined}>
      <header className="tehran-header">
        <Link href={`/${locale}`} className="tehran-brand" aria-label="PET LIFE OS">
          PET LIFE <span>OS</span>
        </Link>
        <div className="tehran-header__tools">
          <Link href={locale === "fa" ? "/en" : "/fa"} className="tehran-lang" lang={locale === "fa" ? "en" : "fa"} aria-label={copy.languageLabel}>
            {copy.language}
          </Link>
          <LandingTheme />
          <Link href={`/${locale}/auth`} className="tehran-signin">
            {copy.signIn}
          </Link>
        </div>
      </header>

      <section className="tehran-hero">
        <div className="tehran-hero__text">
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <div className="tehran-hero__actions">
            <Link href={`/${locale}/auth`} className="tehran-start">
              {copy.start}
            </Link>
            <span className="tehran-hint">{copy.hint}</span>
          </div>
        </div>

        <div className="tehran-city">
          <div className="tehran-scene" data-active={active ?? undefined}>
            <TehranScene className="tehran-scene__art" />
          </div>
          <nav className="tehran-nav" aria-label={copy.cityLabel}>
            <ul>
              {DESTINATIONS.map(({ key, href }, i) => {
                const b = BUILDINGS[key];
                const [label, description] = copy.destinations[key];
                const Icon = ICONS[key];
                const place = {
                  insetInlineStart: pct(b.x, WORLD.width),
                  top: pct(WORLD.ground - b.h, WORLD.height),
                  width: pct(b.w, WORLD.width),
                  height: pct(b.h, WORLD.height),
                  ["--sign-bottom" as string]: pct(b.door, b.h),
                  ["--i" as string]: i,
                } as CSSProperties;
                return (
                  <li key={key} className="tehran-dest" style={place}>
                    <Link
                      href={`/${locale}/${href}`}
                      className="tehran-dest__link"
                      onMouseEnter={() => setActive(key)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(key)}
                      onBlur={() => setActive(null)}
                    >
                      <span className="tehran-tile" aria-hidden="true">
                        <BuildingTile kind={key} />
                      </span>
                      <span className="tehran-sign">
                        <Icon size={16} aria-hidden="true" />
                        <span className="tehran-sign__label">{label}</span>
                      </span>
                      <span className="tehran-dest__desc">{description}</span>
                      <Chevron className="tehran-dest__go" size={18} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </section>

      <nav className="tehran-street" aria-label={copy.moreLabel}>
        {MORE_LINKS.map(({ key, href }) => {
          const Icon = MORE_ICONS[key];
          return (
            <Link key={key} href={`/${locale}/${href}`}>
              <Icon size={16} aria-hidden="true" />
              {copy.more[key]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
