"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Brand } from "@/features/brand/Brand";
import type { RouteLocale } from "@/lib/i18n/config";
import { localizedSetting, useSiteSettings } from "./site-settings";

/** Paths that stay usable during maintenance so staff can sign in and work, and visitors can check status. */
const ALLOWED = ["/admin", "/welcome", "/account", "/status", "/register"];

/**
 * Maintenance mode (maintenance.enabled, a two-admin setting). Visitors and members see a calm notice; the
 * back office, sign-in and the status page keep working. It is a presentation switch — the API stays up.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const settings = useSiteSettings();
  const pathname = usePathname() ?? "";
  const locale = useLocale();
  const t = useTranslations("siteSettings.maintenance");
  const path = pathname.replace(/^\/(fa|en|de|es)(?=\/|$)/, "") || "/";
  if (!settings?.["maintenance.enabled"] || ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return <>{children}</>;
  const message = localizedSetting(settings["maintenance.message"], locale) ?? t("defaultMessage");
  return (
    <main className="site-maintenance" role="main" aria-labelledby="site-maintenance-title">
      <div className="site-maintenance__card">
        <Brand locale={locale as RouteLocale} />
        <h1 id="site-maintenance-title">{t("title")}</h1>
        <p dir="auto">{message}</p>
        <a className="site-maintenance__link" href={`/${locale}/status`}>{t("status")}</a>
      </div>
    </main>
  );
}
