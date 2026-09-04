"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { IconButton, Menu, X, Sheet } from "@petlife/ui";
import { publicDestinations } from "./ProductNavigation";

export function PublicPrimaryNavigation() {
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const label = locale === "fa" ? "بخش‌های محصول" : "Product sections";
  const links = publicDestinations.map(([path, fa, en]) => (
    <Link key={path} href={`/${locale}${path}`} aria-current={pathname === `/${locale}${path}` || pathname?.startsWith(`/${locale}${path}/`) ? "page" : undefined} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-metadata whitespace-nowrap hover:bg-surface-subtle aria-[current=page]:bg-surface-subtle aria-[current=page]:font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{locale === "fa" ? fa : en}</Link>
  ));
  return <div className="public-primary-navigation">
    <nav aria-label={label} className="hidden items-center justify-center xl:flex">{links}</nav>
    <div className="xl:hidden"><IconButton label={label} onClick={() => setOpen(true)} aria-expanded={open} icon={<Menu size={20} aria-hidden="true" />} /></div>
    <Sheet open={open} onClose={() => setOpen(false)} title={label}>
      <div className="flex justify-end"><IconButton label={locale === "fa" ? "بستن منو" : "Close menu"} onClick={() => setOpen(false)} icon={<X size={20} aria-hidden="true" />} /></div>
      <nav aria-label={label} className="flex flex-col">{links}</nav>
    </Sheet>
  </div>;
}
