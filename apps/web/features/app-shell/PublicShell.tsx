"use client";
import { Brand } from "@/features/brand/Brand";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@petlife/ui";
import { useAppBootstrap } from "@/hooks/use-app-bootstrap";
import { useSessionStore } from "@/stores/session-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { DisplayModeToggle } from "@/features/display-mode/DisplayModeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";
import { PublicPrimaryNavigation } from "@/features/navigation/PublicPrimaryNavigation";
import { useLocalPreview } from "@/features/local-preview/LocalPreviewGate";
import { LandingShell } from "@/features/landing/opl/LandingShell";
import { FamilyReel } from "@/features/reel/FamilyReel";
import { PublicFooter } from "./PublicFooter";
import { MemberFrame } from "./MemberFrame";
import { PlatformAnnouncement } from "./PlatformAnnouncement";
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
 *
 * Visitors get the 2026-11 pattern chrome (docs/design/pattern-2026-11): the light glass header with
 * soft buttons, Cookie the cursor dog, and the reel of the page's family before the footer.
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

  // A signed-in member keeps the member frame on public discovery pages, with the family reel at the end.
  if (!preview && status === "authenticated" && user) return <MemberFrame>{children}<FamilyReel /></MemberFrame>;

  return (
    <LandingShell locale={routeLocale} variant="page">
      <div className={`opl-page__body min-h-screen bg-surface-base ${warmSurface ? "public-shell--commerce" : ""}`}>
        <header className="public-site-header opl-hdr opl-public-hdr">
          <div className="opl-wrap opl-hdr__in">
            <Link href={`/${locale}`} className="opl-brand">
              <Brand locale={routeLocale} />
            </Link>
            <PublicPrimaryNavigation menuExtra={<><LocaleSwitcher /><ThemeToggle /><DisplayModeToggle locale={routeLocale} compact /></>} />
            <div className="public-header-actions opl-hact">
              <span className="opl-hprefs">
                <LocaleSwitcher />
                <ThemeToggle />
                <DisplayModeToggle locale={routeLocale} compact />
              </span>
              {preview ? <Link className="opl-btn soft sm" href={`/${locale}/home`}>{publicCopy("openApp")}</Link> : status === "authenticated" && user ? (
                <Link href={`/${locale}/home`}>
                  <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                </Link>
              ) : (
                <button
                  type="button"
                  className="opl-btn primary sm"
                  onClick={() =>
                    router.push(
                      `/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
                    )
                  }
                >
                  {publicCopy("logIn")}
                </button>
              )}
            </div>
          </div>
        </header>
        <main id="lp-main" className="public-experience-main"><PlatformAnnouncement surface="public" />{children}</main>
        <FamilyReel />
        <PublicFooter locale={routeLocale} />
      </div>
    </LandingShell>
  );
}
