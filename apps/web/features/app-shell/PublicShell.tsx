"use client";
import { Brand } from "@/features/brand/Brand";
import { localeHomePath } from "@/lib/seo/site";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, Button } from "@petlife/ui";
import { useAppBootstrap } from "@/hooks/use-app-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { DisplayModeToggle } from "@/features/display-mode/DisplayModeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";
import { PublicPrimaryNavigation } from "@/features/navigation/PublicPrimaryNavigation";
import { useLocalPreview } from "@/features/local-preview/LocalPreviewGate";
import { PublicFooter } from "./PublicFooter";
import { MemberFrame } from "./MemberFrame";
import type { RouteLocale } from "@/lib/i18n/config";

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
  const locale = useLocale();
  const routeLocale = locale as RouteLocale;
  const publicCopy = useTranslations("publicNavigation");
  const router = useRouter();
  const preview = useLocalPreview();
  const warmSurface = /^\/(fa|en|de|es)\//.test(usePathname() ?? "");

  // A signed-in member keeps the member frame on public discovery pages.
  if (!preview && status === "authenticated" && user) return <MemberFrame>{children}</MemberFrame>;

  return (
    <div className={`min-h-screen bg-surface-base ${warmSurface ? "public-shell--commerce" : ""}`}>
      <header className="public-site-header border-b border-border-subtle bg-surface-elevated px-4 py-3">
        <Link href={localeHomePath(locale)} className="text-section-title text-text-primary">
          <Brand />
        </Link>
        <PublicPrimaryNavigation />
        <div className="public-header-actions flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <DisplayModeToggle locale={routeLocale} compact />
          {preview ? <Link href={`/${locale}/home`}>{publicCopy("openApp")}</Link> : status === "authenticated" && user ? (
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
              {publicCopy("logIn")}
            </Button>
          )}
        </div>
      </header>
      <main className="public-experience-main">{children}</main>
      <PublicFooter locale={routeLocale} />
    </div>
  );
}
