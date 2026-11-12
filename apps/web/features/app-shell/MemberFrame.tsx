"use client";
import { Brand } from "@/features/brand/Brand";
import { PlatformAnnouncement } from "./PlatformAnnouncement";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CircleHelp, IconButton } from "@petlife/ui";
import { useSessionStore } from "@/stores/session-store";
import { MobileTabBar, PetContextControl, PrimaryNav } from "@/features/navigation/MemberNavigation";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { DisplayModeToggle } from "@/features/display-mode/DisplayModeToggle";
import { LanguageToggle } from "@/features/locale/LanguageToggle";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { AccountMenu } from "@/features/account/AccountMenu";
import "@/features/navigation/member-shell.css";
import "./member-surfaces.css";
import { memberSurface } from "./member-surface";
import { useActivePet } from "@/hooks/use-active-pet";
import { usePetAccess } from "@/hooks/use-pet-access";
import { MemberGlassDock } from "./MemberGlassDock";
import { LandingShell } from "@/features/landing/opl/LandingShell";
import { CookieToggle } from "@/features/landing/opl/CookieToggle";
import { FamilyReel } from "@/features/reel/FamilyReel";
import { isRouteLocale } from "@/lib/i18n/config";
import "@/features/landing/opl/opl-landing.css";
import "@/features/landing/opl/opl-body.css";
import "@/features/reel/reel.css";

/**
 * The one frame a signed-in member sees everywhere — private pages (AppShell) and the public
 * discovery pages (PublicShell). It sits on the 2026-11 pattern (docs/design/pattern-2026-11): warm paper,
 * the glass header, soft cards and capsule buttons in light and dark, Cookie the cursor dog, and the reel of
 * the page's family at the end. Personal records add the side dock; commerce and service journeys do not.
 */
export function MemberFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const member = useTranslations("pattern2026.member");
  const locale = useLocale();
  const routeLocale = isRouteLocale(locale) ? locale : "en";
  const router = useRouter();
  const glass = memberSurface(usePathname() ?? "") === "glass";
  const user = useSessionStore((s) => s.user);
  const { activePet, pets } = useActivePet();
  const { access } = usePetAccess(activePet?.id ?? pets[0]?.id ?? null);
  return (
    <LandingShell locale={routeLocale} variant="page">
      <div className={`opl-page__body workspace-shell member-shell ${glass ? "member-shell--glass" : "member-shell--service"}`}>
        <a className="member-skip-link" href="#member-main-content">
          {member("skip")}
        </a>
        <header className="member-header">
          <div className="member-header__bar">
            <Link href={`/${locale}/home`} className="member-header__brand">
              <Brand locale={routeLocale} />
            </Link>
            <PrimaryNav canViewHealth={access?.canViewHealth === true} />
            <div className="member-header__tools">
              <div className="member-header__pet">
                <PetContextControl />
              </div>
              <span className="member-header__secondary member-header__support">
                <IconButton
                  label={t("support")}
                  onClick={() => router.push(`/${locale}/support`)}
                  icon={
                    <CircleHelp size={20} aria-hidden="true" />
                  }
                />
              </span>
              <NotificationBell />
              <span className="member-header__secondary">
                <LanguageToggle />
                <ThemeToggle />
                <DisplayModeToggle locale={locale as "fa" | "en"} compact />
              </span>
              {user ? <AccountMenu user={user} /> : null}
            </div>
          </div>
        </header>
        <main id="member-main-content" tabIndex={-1} className="workspace-main motion-page">
          <PlatformAnnouncement />
          {children}
          <FamilyReel />
          <div className="member-foot"><CookieToggle /></div>
        </main>
        {glass ? <MemberGlassDock access={access} /> : null}
        <MobileTabBar canViewHealth={access?.canViewHealth === true} />
      </div>
    </LandingShell>
  );
}
