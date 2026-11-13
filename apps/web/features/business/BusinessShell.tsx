"use client";
import "@/features/landing/opl/opl-landing.css";
import "@/features/navigation/operator-shell.css";
import "./business.css";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@petlife/ui";
import { Brand } from "@/features/brand/Brand";
import type { RouteLocale } from "@/lib/i18n/config";
import { authService } from "@/services/auth.service";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";

type SessionState = "loading" | "authenticated" | "unauthenticated";

/**
 * The partner's own frame — separate from the pet-owner member shell, the provider console and the seller console.
 * It holds the business home; each business's day-to-day work still opens in its own console.
 */
export function BusinessShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("businessHub");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [session, setSession] = useState<SessionState>("loading");

  useEffect(() => {
    let live = true;
    authService
      .getSession()
      .then(() => live && setSession("authenticated"))
      .catch(() => live && setSession("unauthenticated"));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (session === "unauthenticated") router.replace(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [session, router, locale]);

  if (session !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={tCommon("loading")} />
      </div>
    );
  }

  return (
    <div className="opl-page workspace-shell operator-shell business-shell min-h-screen">
      <header className="operator-shell__header">
        <div className="operator-shell__header-inner">
          <Link href={`/${locale}/business`} className="operator-shell__brand" aria-label={t("title")}>
            <Brand compact locale={locale as RouteLocale} />
          </Link>
          <div className="flex flex-col">
            <span className="text-section-title text-text-primary">{t("title")}</span>
            <span className="text-metadata text-text-secondary">{t("subtitle")}</span>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="workspace-main operator-shell__main w-full min-w-0 px-4 py-6">{children}</main>
    </div>
  );
}
