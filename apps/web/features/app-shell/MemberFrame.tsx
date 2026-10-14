"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CircleHelp, IconButton } from "@petlife/ui";
import { useSessionStore } from "@/stores/session-store";
import { MobileTabBar, PetContextControl, PrimaryNav } from "@/features/navigation/MemberNavigation";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LanguageToggle } from "@/features/locale/LanguageToggle";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { AccountMenu } from "@/features/account/AccountMenu";
import "@/features/navigation/member-shell.css";
import "./member-surfaces.css";
import { memberSurface } from "./member-surface";
import { useActivePet } from "@/hooks/use-active-pet";
import { usePetAccess } from "@/hooks/use-pet-access";
import { MemberGlassDock } from "./MemberGlassDock";

/**
 * The one frame a signed-in member sees everywhere — private pages (AppShell) and the public
 * discovery pages (PublicShell). Personal records retain the glass surface;
 * commerce and service journeys keep member navigation on their dedicated surface.
 */
export function MemberFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const glass = memberSurface(usePathname() ?? "") === "glass";
  const user = useSessionStore((s) => s.user);
  const { activePet, pets } = useActivePet();
  const { access } = usePetAccess(activePet?.id ?? pets[0]?.id ?? null);
  return (
    <div className={`workspace-shell member-shell ${glass ? "member-shell--glass" : "member-shell--service"}`}>
      <a className="member-skip-link" href="#member-main-content">
        {locale === "fa" ? "رفتن به محتوای صفحه" : "Skip to content"}
      </a>
      <header className="member-header">
        <div className="member-header__bar">
          <Link href={`/${locale}/home`} className="member-header__brand">
            {t("appName")}
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
            </span>
            {user ? <AccountMenu user={user} /> : null}
          </div>
        </div>
      </header>
      <main id="member-main-content" tabIndex={-1} className="workspace-main motion-page">{children}</main>
      {glass ? <MemberGlassDock access={access} /> : null}
      <MobileTabBar canViewHealth={access?.canViewHealth === true} />
    </div>
  );
}
