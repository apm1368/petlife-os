"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconButton } from "@petlife/ui";
import { useSessionStore } from "@/stores/session-store";
import { MobileTabBar, PetContextControl, PrimaryNav } from "@/features/navigation/MemberNavigation";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LanguageToggle } from "@/features/locale/LanguageToggle";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { AccountMenu } from "@/features/account/AccountMenu";
import "@/features/navigation/member-shell.css";

/**
 * The one frame a signed-in member sees everywhere — private pages (AppShell) and the public
 * discovery pages they browse while signed in (PublicShell) — so the navigation never changes
 * under them when they move from Health to Shop to Travel.
 */
export function MemberFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  return (
    <div className="workspace-shell member-shell">
      <a className="member-skip-link" href="#member-main-content">
        {locale === "fa" ? "رفتن به محتوای صفحه" : "Skip to content"}
      </a>
      <header className="member-header">
        <div className="member-header__bar">
          <Link href={`/${locale}/home`} className="member-header__brand">
            {t("appName")}
          </Link>
          <PrimaryNav />
          <div className="member-header__tools">
            <div className="member-header__pet">
              <PetContextControl />
            </div>
            <span className="member-header__secondary member-header__support">
              <IconButton
                label={t("support")}
                onClick={() => router.push(`/${locale}/support`)}
                icon={
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                }
              />
            </span>
            <NotificationBell />
            <span className="member-header__secondary">
              <LanguageToggle />
              <ThemeToggle />
            </span>
            {user ? <AccountMenu user={user} /> : null}
          </div>
        </div>
      </header>
      <main id="member-main-content" tabIndex={-1} className="workspace-main motion-page">{children}</main>
      <MobileTabBar />
    </div>
  );
}
