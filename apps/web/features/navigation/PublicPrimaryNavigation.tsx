"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { ChevronDown, IconButton, Menu, X, Sheet } from "@petlife/ui";
import { exploreDestinations, globalDestinations, type NavigationItem } from "./ProductNavigation";

export function PublicPrimaryNavigation() {
  const locale = useLocale(); const localizedPath = usePathname();
  const pathname = localizedPath.replace(new RegExp(`^/${locale}`), "") || "/";
  const [open, setOpen] = useState(false); const [exploreOpen, setExploreOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);
  // Click toggles (hover-to-open made the first click close the menu again); Escape and outside clicks close it.
  useEffect(() => {
    if (!exploreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExploreOpen(false); };
    const onDown = (e: PointerEvent) => { if (!exploreRef.current?.contains(e.target as Node)) setExploreOpen(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [exploreOpen]);
  const label = locale === "fa" ? "ناوبری اصلی" : "Primary navigation";
  const active = (item: NavigationItem) => item.match?.(pathname) ?? (pathname === item.path || pathname.startsWith(`${item.path}/`));
  const link = (item: NavigationItem, mobile = false) => <Link key={item.path} href={`/${locale}${item.path}`} aria-current={active(item) ? "page" : undefined} onClick={() => setOpen(false)} className={`${mobile ? "w-full" : ""} min-h-11 border-b-2 border-transparent px-3 py-3 text-metadata whitespace-nowrap text-text-secondary transition-colors hover:text-text-primary aria-[current=page]:border-brand-natural aria-[current=page]:font-semibold aria-[current=page]:text-brand-natural focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]`}>{locale === "fa" ? item.fa : item.en}</Link>;

  return <div className="public-primary-navigation">
    <nav aria-label={label} className="hidden items-center justify-center lg:flex">
      {link(globalDestinations[0]!)}
      <div className="relative" ref={exploreRef}>
        <button type="button" onClick={() => setExploreOpen((value) => !value)} aria-expanded={exploreOpen} aria-haspopup="true" className="min-h-11 border-b-2 border-transparent px-3 py-3 text-metadata text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><span className="inline-flex items-center gap-1">{locale === "fa" ? "کاوش" : "Explore"} <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${exploreOpen ? "rotate-180" : ""}`} /></span></button>
        {exploreOpen ? <div onClick={() => setExploreOpen(false)} className="absolute start-0 top-full z-50 grid w-[34rem] grid-cols-2 rounded-[var(--radius-md)] border border-border-subtle bg-surface-raised p-2 shadow-[var(--shadow-2)]">{exploreDestinations.map((item) => link(item))}</div> : null}
      </div>
      {globalDestinations.slice(1).map((item) => link(item))}
    </nav>
    <div className="lg:hidden"><IconButton label={label} onClick={() => setOpen(true)} aria-expanded={open} icon={<Menu size={20} aria-hidden="true" />} /></div>
    <Sheet open={open} onClose={() => setOpen(false)} title={label}>
      <div className="flex justify-end"><IconButton label={locale === "fa" ? "بستن منو" : "Close menu"} onClick={() => setOpen(false)} icon={<X size={20} aria-hidden="true" />} /></div>
      <nav aria-label={label} className="flex flex-col">
        {link(globalDestinations[0]!, true)}
        <p className="mt-4 border-b border-border-subtle px-3 pb-2 text-metadata font-semibold text-text-primary">{locale === "fa" ? "کاوش" : "Explore"}</p>
        <div className="grid grid-cols-2">{exploreDestinations.map((item) => link(item, true))}</div>
        <p className="mt-4 border-b border-border-subtle px-3 pb-2 text-metadata font-semibold text-text-primary">{locale === "fa" ? "دسترسی سریع" : "Quick access"}</p>
        {globalDestinations.slice(1).map((item) => link(item, true))}
      </nav>
    </Sheet>
  </div>;
}

