"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Brand } from "@/features/brand/Brand";
import { Bird } from "@/features/landing/opl/Bird";
import { isRouteLocale } from "@/lib/i18n/config";

/** The 404 on the 2026-11 pattern: the opl mark linking home, one soft card with a bird perched on its edge, warm paper. */
export function NotFoundFrame({ children }: { children: React.ReactNode }) {
  const raw = useLocale();
  const locale = isRouteLocale(raw) ? raw : "en";
  return (
    <div className="opl-page opl-boot">
      <Link href={locale === "fa" ? "/" : `/${locale}`} className="opl-boot__home"><Brand locale={locale} /></Link>
      <main className="opl-boot__card opl-boot__card--perch">
        <Bird kind="budgie" style={{ top: -42, insetInlineEnd: 36 }} />
        {children}
      </main>
    </div>
  );
}
