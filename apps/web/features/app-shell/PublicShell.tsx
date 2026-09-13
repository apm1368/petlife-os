"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, Button } from "@petlife/ui";
import { useAppBootstrap } from "@/hooks/use-app-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";
import { PublicPrimaryNavigation } from "@/features/navigation/PublicPrimaryNavigation";
import { useLocalPreview } from "@/features/local-preview/LocalPreviewGate";
import { PublicFooter } from "./PublicFooter";

/**
 * The shell for public browsing surfaces (vet/service/shop discovery) —
 * unlike AppShell, it never redirects an unauthenticated visitor away.
 * Still runs the full useAppBootstrap (session + household + pets), not
 * just the session, so an already-signed-in visitor keeps their active-pet
 * context (compatibility checks, booking pre-fill) on these pages exactly
 * as before they were split out from AppShell — useAppBootstrap itself
 * never redirects on 401, it just leaves the pet store empty, which every
 * discovery view here already renders gracefully for an anonymous visitor.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  useAppBootstrap();
  const user = useSessionStore((s) => s.user);
  const status = useSessionStore((s) => s.status);
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const preview = useLocalPreview();

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="public-site-header border-b border-border-subtle bg-surface-elevated px-4 py-3">
        <Link href={`/${locale}`} className="text-section-title text-text-primary">
          {t("appName")}
        </Link>
        <PublicPrimaryNavigation />
        <div className="public-header-actions flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          {preview ? <Link href={`/${locale}/home`}>{locale === "fa" ? "ورود به برنامه" : "Open app"}</Link> : status === "authenticated" && user ? (
            <Link href={`/${locale}/home`}>
              <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
            </Link>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                router.push(
                  `/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
                )
              }
            >
              {t("logIn")}
            </Button>
          )}
        </div>
      </header>
      <main className="public-experience-main">{children}</main>
      <PublicFooter />
    </div>
  );
}
