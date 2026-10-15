"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Heart, Repeat, ShoppingBag } from "@petlife/ui";
import type { ReactNode } from "react";
import "./commerce-design.css";

/** Shared shop navigation; all destinations use existing commerce routes. */
export function CommercePage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("commerce.design");
  return <div className={`commerce-page ${className}`}>
    <nav className="commerce-nav" aria-label={t("navLabel")}>
      <Link className="commerce-nav__brand" href={`/${locale}/shop`}><ShoppingBag size={20} aria-hidden="true" />{t("shop")}</Link>
      <div className="commerce-nav__links">
        <Link href={`/${locale}/orders`}>{t("orders")}</Link>
        <Link href={`/${locale}/repeat-delivery`}><Repeat size={16} aria-hidden="true" />{t("repeat")}</Link>
        <Link href={`/${locale}/favorites`}><Heart size={16} aria-hidden="true" />{t("favorites")}</Link>
        <Link href={`/${locale}/cart`}><ShoppingBag size={17} aria-hidden="true" />{t("cart")}</Link>
      </div>
    </nav>
    {children}
  </div>;
}

export function CommerceArrow({ size = 18 }: { size?: number }) {
  return <ArrowRight className="commerce-arrow" size={size} aria-hidden="true" />;
}
