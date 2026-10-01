"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Avatar, ChevronLeft, ChevronRight, Compass, Sheet } from "@petlife/ui";
import { useActivePet } from "@/hooks/use-active-pet";
import { EXPLORE_GROUPS, PRIMARY_DESTINATIONS, currentDestination } from "./consumer-nav";

type Locale = "fa" | "en";
const useMemberLocale = (): Locale => (useLocale() === "en" ? "en" : "fa");
const usePathKey = (locale: string) => (usePathname() ?? "").replace(new RegExp(`^/${locale}`), "") || "/";

/** Closes a popover on Escape (focus back to its trigger), outside pointer-down and route change. */
function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement>[], trigger: React.RefObject<HTMLElement>) {
  const pathname = usePathname();
  useEffect(() => { close(); /* route changed */ }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); trigger.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, close, refs, trigger]);
}

/** Desktop primary navigation with the Explore mega menu. Hidden below 1024px (the bottom bar takes over). */
export function PrimaryNav() {
  const locale = useMemberLocale();
  const fa = locale === "fa";
  const current = currentDestination(usePathKey(locale));
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const panelId = useId();
  const close = () => setOpen(false);
  useDismiss(open, close, [wrap], button);

  const hover = (next: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(next), next ? 90 : 180);
  };
  const Forward = fa ? ChevronLeft : ChevronRight;

  return (
    <div className="member-nav" ref={wrap} onPointerLeave={hover(false)}>
      <nav aria-label={fa ? "منوی اصلی" : "Main menu"}>
        <ul>
          {PRIMARY_DESTINATIONS.map((d) =>
            d.key === "explore" ? (
              <li key={d.key} onPointerEnter={hover(true)}>
                <button
                  ref={button}
                  type="button"
                  className="member-nav__link"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-current={current === "explore" ? "page" : undefined}
                  onClick={() => setOpen((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); requestAnimationFrame(() => panel.current?.querySelector<HTMLAnchorElement>("a")?.focus()); }
                  }}
                >
                  {fa ? d.fa : d.en}
                  <span className="member-nav__caret" aria-hidden="true" />
                </button>
              </li>
            ) : (
              <li key={d.key} onPointerEnter={hover(false)}>
                <Link href={`/${locale}${d.href}`} className="member-nav__link" aria-current={current === d.key ? "page" : undefined}>
                  {fa ? d.fa : d.en}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
      <div id={panelId} ref={panel} className="mega" data-open={open} hidden={!open} onPointerEnter={hover(true)}>
        <div className="mega__inner">
          {EXPLORE_GROUPS.map((group) => (
            <section key={group.key} className="mega__group" aria-labelledby={`${panelId}-${group.key}`}>
              <h2 id={`${panelId}-${group.key}`}>{fa ? group.fa : group.en}</h2>
              <ul>
                {group.links.map(({ href, icon: Icon, fa: f, en }) => (
                  <li key={href}>
                    <Link href={`/${locale}${href}`} className="mega__link">
                      <span className="mega__icon"><Icon size={18} aria-hidden="true" /></span>
                      <span className="mega__text"><strong>{fa ? f[0] : en[0]}</strong><span>{fa ? f[1] : en[1]}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="mega__foot">
          <Link href={`/${locale}/explore`}>{fa ? "همهٔ بخش‌های پت‌لایف" : "Everything in PET LIFE"}<Forward size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  );
}

/** The active pet, always visible: switch pets or jump to the pet without hunting through menus. */
export function PetContextControl({ compact = false }: { compact?: boolean }) {
  const locale = useMemberLocale();
  const fa = locale === "fa";
  const { pets, activePetId, switchActivePet } = useActivePet();
  const activeId = activePetId ?? pets[0]?.id ?? null;
  const active = pets.find((p) => p.id === activeId) ?? null;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  useDismiss(open, () => setOpen(false), [wrap], button);
  if (!active) {
    return <Link href={`/${locale}/pets/new`} className="pet-context pet-context--add">{fa ? "افزودن حیوان" : "Add a pet"}</Link>;
  }
  return (
    <div className="pet-context" ref={wrap}>
      <button ref={button} type="button" className="pet-context__trigger" aria-expanded={open} aria-controls={listId} aria-label={fa ? `حیوان فعال: ${active.name}` : `Active pet: ${active.name}`} onClick={() => setOpen((v) => !v)}>
        <Avatar name={active.name} src={active.photoUrl ?? undefined} size="sm" />
        {compact ? null : <span>{active.name}</span>}
        <span className="member-nav__caret" aria-hidden="true" />
      </button>
      <div id={listId} className="pet-context__menu" data-open={open} hidden={!open}>
        <p>{fa ? "حیوان فعال" : "Active pet"}</p>
        <ul>
          {pets.map((p) => (
            <li key={p.id}>
              <button type="button" aria-pressed={p.id === activeId} onClick={() => { void switchActivePet(p.id); setOpen(false); }}>
                <Avatar name={p.name} src={p.photoUrl ?? undefined} size="sm" />
                <span>{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="pet-context__links">
          <Link href={`/${locale}/pets/${active.id}`}>{fa ? `پروفایل ${active.name}` : `${active.name}'s profile`}</Link>
          <Link href={`/${locale}/pets/new`}>{fa ? "افزودن حیوان" : "Add a pet"}</Link>
        </div>
      </div>
    </div>
  );
}

/** Below 1024px: five large targets at the thumb; Explore opens a grouped sheet instead of a page. */
export function MobileTabBar() {
  const locale = useMemberLocale();
  const fa = locale === "fa";
  const router = useRouter();
  const current = currentDestination(usePathKey(locale));
  const [sheet, setSheet] = useState(false);
  return (
    <>
      <nav className="member-tabbar" aria-label={fa ? "منوی پایین" : "Bottom menu"}>
        {PRIMARY_DESTINATIONS.filter((d) => d.mobile).map(({ key, href, fa: labelFa, en, icon: Icon }) =>
          key === "explore" ? (
            <button key={key} type="button" aria-expanded={sheet} aria-current={current === key ? "page" : undefined} onClick={() => setSheet(true)}>
              <Compass size={21} aria-hidden="true" />
              <span>{fa ? labelFa : en}</span>
            </button>
          ) : (
            <Link key={key} href={`/${locale}${href}`} aria-current={current === key ? "page" : undefined}>
              <Icon size={21} aria-hidden="true" />
              <span>{fa ? labelFa : en}</span>
            </Link>
          ),
        )}
      </nav>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={fa ? "کاوش" : "Explore"}>
        <div className="explore-sheet">
          <PetContextSheetRow onNavigate={() => setSheet(false)} />
          {EXPLORE_GROUPS.map((group) => (
            <section key={group.key}>
              <h3>{fa ? group.fa : group.en}</h3>
              <ul>
                {group.links.map(({ href, icon: Icon, fa: f, en }) => (
                  <li key={href}>
                    <button type="button" onClick={() => { setSheet(false); router.push(`/${locale}${href}`); }}>
                      <Icon size={20} aria-hidden="true" />
                      <span><strong>{fa ? f[0] : en[0]}</strong><small>{fa ? f[1] : en[1]}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <button type="button" className="explore-sheet__close" onClick={() => setSheet(false)}>{fa ? "بستن" : "Close"}</button>
        </div>
      </Sheet>
    </>
  );
}

function PetContextSheetRow({ onNavigate }: { onNavigate: () => void }) {
  const locale = useMemberLocale();
  const fa = locale === "fa";
  const router = useRouter();
  const { pets, activePetId, switchActivePet } = useActivePet();
  const activeId = activePetId ?? pets[0]?.id ?? null;
  if (pets.length === 0) return null;
  return (
    <section>
      <h3>{fa ? "حیوان فعال" : "Active pet"}</h3>
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
