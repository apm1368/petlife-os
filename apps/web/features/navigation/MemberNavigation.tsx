"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Avatar, ChevronLeft, ChevronRight, Compass, Sheet } from "@petlife/ui";
import { useActivePet } from "@/hooks/use-active-pet";
import { LanguageToggle } from "@/features/locale/LanguageToggle";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { EXPLORE_GROUPS, PRIMARY_DESTINATIONS, currentDestination } from "./consumer-nav";
import { useHrefFilter } from "@/features/site-settings/site-settings";
import type { RouteLocale } from "@/lib/i18n/config";

const NAV_COPY: Record<RouteLocale, { main: string; destinations: string; everything: string; addPet: string; activePet: string; petProfile: (name: string) => string; bottom: string; explore: string; preferences: string; support: string; close: string }> = {
  fa: { main: "منوی اصلی", destinations: "بخش‌های اپت لایف", everything: "همهٔ بخش‌های اپت لایف", addPet: "افزودن حیوان", activePet: "حیوان فعال", petProfile: (name) => `پروفایل ${name}`, bottom: "منوی پایین", explore: "کاوش", preferences: "زبان و ظاهر", support: "کمک و پشتیبانی", close: "بستن" },
  en: { main: "Main menu", destinations: "opetlife destinations", everything: "Everything in opetlife", addPet: "Add a pet", activePet: "Active pet", petProfile: (name) => `${name}'s profile`, bottom: "Bottom menu", explore: "Explore", preferences: "Language and appearance", support: "Help and support", close: "Close" },
  de: { main: "Hauptmenü", destinations: "opetlife-Bereiche", everything: "Alle Bereiche von opetlife", addPet: "Tier hinzufügen", activePet: "Aktives Tier", petProfile: (name) => `Profil von ${name}`, bottom: "Untere Navigation", explore: "Entdecken", preferences: "Sprache und Darstellung", support: "Hilfe und Support", close: "Schließen" },
  es: { main: "Menú principal", destinations: "Secciones de opetlife", everything: "Todo opetlife", addPet: "Añadir mascota", activePet: "Mascota activa", petProfile: (name) => `Perfil de ${name}`, bottom: "Menú inferior", explore: "Explorar", preferences: "Idioma y apariencia", support: "Ayuda y soporte", close: "Cerrar" },
};

const usePathKey = (locale: string) => (usePathname() ?? "").replace(new RegExp(`^/${locale}`), "") || "/";

/** Non-modal disclosures leave Tab free; Escape alone returns focus to the trigger. */
function useDismiss(open: boolean, close: () => void, boundary: React.RefObject<HTMLElement>, trigger: React.RefObject<HTMLElement>, panel?: React.RefObject<HTMLElement>) {
  const pathname = usePathname();
  useEffect(() => { close(); }, [pathname, close]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); trigger.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!boundary.current?.contains(e.target as Node)) close(); };
    const onFocus = (e: FocusEvent) => {
      const target = e.target as Node;
      const inside = panel ? trigger.current?.contains(target) || panel.current?.contains(target) : boundary.current?.contains(target);
      if (!inside) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open, close, boundary, trigger, panel]);
}

/** Desktop primary navigation with the Explore mega menu. Hidden below 1024px (the bottom bar takes over). */
export function PrimaryNav({ canViewHealth = true }: { canViewHealth?: boolean }) {
  const enabled = useHrefFilter();
  const locale = useLocale() as RouteLocale;
  const c = NAV_COPY[locale];
  const current = currentDestination(usePathKey(locale));
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const focusOnOpen = useRef(false);
  const panelId = useId();
  const close = useCallback(() => {
    clearTimeout(hoverTimer.current);
    focusOnOpen.current = false;
    setOpen(false);
  }, []);
  useDismiss(open, close, wrap, button, panel);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    if (open && focusOnOpen.current) {
      panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
      focusOnOpen.current = false;
    }
  }, [open]);

  const hover = (next: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer.current);
    if (!next && panel.current?.contains(document.activeElement)) return;
    hoverTimer.current = setTimeout(() => setOpen(next), next ? 90 : 180);
  };
  const Forward = locale === "fa" ? ChevronLeft : ChevronRight;

  return (
    <div className="member-nav" ref={wrap} onPointerLeave={hover(false)}>
      <nav aria-label={c.main}>
        <ul>
          {PRIMARY_DESTINATIONS.filter(d => enabled(d.href) && (d.key !== "health" || canViewHealth)).map((d) =>
            d.key === "explore" ? (
              <li key={d.key} onPointerEnter={hover(true)}>
                <button
                  ref={button}
                  type="button"
                  className="member-nav__link"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-current={current === "explore" ? "page" : undefined}
                  onClick={() => {
                    clearTimeout(hoverTimer.current);
                    setOpen((v) => !v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      clearTimeout(hoverTimer.current);
                      if (open) panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
                      else { focusOnOpen.current = true; setOpen(true); }
                    }
                  }}
                >
                  {d[locale]}
                  <span className="member-nav__caret" aria-hidden="true" />
                </button>
              </li>
            ) : (
              <li key={d.key} onPointerEnter={hover(false)}>
                <Link href={`/${locale}${d.href}`} className="member-nav__link" aria-current={current === d.key ? "page" : undefined}>
                  {d[locale]}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
      <div id={panelId} ref={panel} className="mega" role="navigation" data-open={open} hidden={!open} onPointerEnter={hover(true)} aria-label={c.destinations}>
        <div className="mega__inner">
          {EXPLORE_GROUPS.map((group, gi) => (
            <section key={group.key} className="mega__group" style={{ ["--g" as string]: gi }} aria-labelledby={`${panelId}-${group.key}`}>
              <h2 id={`${panelId}-${group.key}`}>{group[locale]}</h2>
              <ul>
                {group.links.filter(link => enabled(link.href) && (canViewHealth || link.href !== "/pets/active?view=health")).map(({ href, icon: Icon, ...labels }) => (
                  <li key={href}>
                    <Link href={`/${locale}${href}`} className="mega__link" onClick={close}>
                      <span className="mega__icon"><Icon size={18} aria-hidden="true" /></span>
                      <span className="mega__text"><strong>{labels[locale][0]}</strong><span>{labels[locale][1]}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mega__foot">
          <Link href={`/${locale}/explore`} onClick={close}>{c.everything}<Forward size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  );
}

/** The active pet, always visible: switch pets or jump to the pet without hunting through menus. */
export function PetContextControl({ compact = false }: { compact?: boolean }) {
  const locale = useLocale() as RouteLocale;
  const c = NAV_COPY[locale];
  const { pets, activePetId, switchActivePet } = useActivePet();
  const activeId = activePetId ?? pets[0]?.id ?? null;
  const active = pets.find((p) => p.id === activeId) ?? null;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, wrap, button);
  if (!active) {
    return <Link href={`/${locale}/pets/new`} className="pet-context pet-context--add">{c.addPet}</Link>;
  }
  return (
    <div className="pet-context" ref={wrap}>
      <button ref={button} type="button" className="pet-context__trigger" aria-expanded={open} aria-controls={listId} aria-label={`${c.activePet}: ${active.name}`} onClick={() => setOpen((v) => !v)}>
        <Avatar name={active.name} src={active.photoUrl ?? undefined} size="sm" />
        {compact ? null : <span>{active.name}</span>}
        <span className="member-nav__caret" aria-hidden="true" />
      </button>
      <div id={listId} className="pet-context__menu" data-open={open} hidden={!open}>
        <p>{c.activePet}</p>
        <ul>
          {pets.map((p) => (
            <li key={p.id}>
              <button type="button" aria-pressed={p.id === activeId} onClick={() => { void switchActivePet(p.id); setOpen(false); button.current?.focus(); }}>
                <Avatar name={p.name} src={p.photoUrl ?? undefined} size="sm" />
                <span>{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="pet-context__links">
          <Link href={`/${locale}/pets/${active.id}`}>{c.petProfile(active.name)}</Link>
          <Link href={`/${locale}/pets/new`}>{c.addPet}</Link>
        </div>
      </div>
    </div>
  );
}

/** Below 1024px: five large targets at the thumb; Explore opens a grouped sheet instead of a page. */
export function MobileTabBar({ canViewHealth = true }: { canViewHealth?: boolean }) {
  const enabled = useHrefFilter();
  const locale = useLocale() as RouteLocale;
  const c = NAV_COPY[locale];
  const router = useRouter();
  const current = currentDestination(usePathKey(locale));
  const [sheet, setSheet] = useState(false);
  const pathname = usePathname();
  useEffect(() => setSheet(false), [pathname]);
  return (
    <>
      <nav className="member-tabbar" aria-label={c.bottom}>
        {PRIMARY_DESTINATIONS.filter((d) => d.mobile && enabled(d.href) && (d.key !== "health" || canViewHealth)).map(({ key, href, icon: Icon, ...labels }) =>
          key === "explore" ? (
            <button key={key} type="button" aria-haspopup="dialog" aria-expanded={sheet} aria-current={current === key ? "page" : undefined} onClick={() => setSheet(true)}>
              <Compass size={21} aria-hidden="true" />
              <span>{labels[locale]}</span>
            </button>
          ) : (
            <Link key={key} href={`/${locale}${href}`} aria-current={current === key ? "page" : undefined}>
              <Icon size={21} aria-hidden="true" />
              <span>{labels[locale]}</span>
            </Link>
          ),
        )}
      </nav>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={c.explore} className="member-explore-panel">
        <div className="explore-sheet">
          <PetContextSheetRow onNavigate={() => setSheet(false)} />
          <div className="explore-sheet__preferences" role="group" aria-label={c.preferences}>
            <span>{c.preferences}</span>
            <LanguageToggle />
            <ThemeToggle />
          </div>
          {EXPLORE_GROUPS.map((group) => (
            <section key={group.key}>
              <h3>{group[locale]}</h3>
              <ul>
                {group.links.filter(link => enabled(link.href) && (canViewHealth || link.href !== "/pets/active?view=health")).map(({ href, icon: Icon, ...labels }) => (
                  <li key={href}>
                    <button type="button" onClick={() => { setSheet(false); router.push(`/${locale}${href}`); }}>
                      <Icon size={20} aria-hidden="true" />
                      <span><strong>{labels[locale][0]}</strong><small>{labels[locale][1]}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <Link href={`/${locale}/support`} className="explore-sheet__support" onClick={() => setSheet(false)}>{c.support}</Link>
          <button type="button" className="explore-sheet__close" onClick={() => setSheet(false)}>{c.close}</button>
        </div>
      </Sheet>
    </>
  );
}

function PetContextSheetRow({ onNavigate }: { onNavigate: () => void }) {
  const locale = useLocale() as RouteLocale;
  const c = NAV_COPY[locale];
  const router = useRouter();
  const { pets, activePetId, switchActivePet } = useActivePet();
  const activeId = activePetId ?? pets[0]?.id ?? null;
  if (pets.length === 0) return null;
  return (
    <section>
      <h3>{c.activePet}</h3>
      <div className="explore-sheet__pets">
        {pets.map((p) => (
          <button key={p.id} type="button" aria-pressed={p.id === activeId} onClick={() => { void switchActivePet(p.id); onNavigate(); router.push(`/${locale}/pets/${p.id}`); }}>
            <Avatar name={p.name} src={p.photoUrl ?? undefined} size="sm" />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
