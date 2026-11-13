"use client";
import { LocalPreviewGate } from "@/features/local-preview/LocalPreviewGate";
import { VerificationRequiredNotice } from "@/features/partner-verification/VerificationRequiredNotice";
import { Brand } from "@/features/brand/Brand";
import type { RouteLocale } from "@/lib/i18n/config";
import "@/features/landing/opl/opl-landing.css";
import "@/features/navigation/operator-shell.css";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Skeleton, StatusLabel } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { providerOsService } from "@/services/provider-os.service";
import { useProviderBootstrap } from "@/hooks/use-provider-bootstrap";
import { useProviderStore } from "@/stores/provider-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";
import { BusinessConsoleLinks } from "@/features/business/BusinessConsoleLinks";

type SessionState = "loading" | "authenticated" | "unauthenticated";

const NAV_ITEMS = [
  { href: "", labelKey: "nav.home" },
  // Handoff 24 — the clinical panel. Placed immediately after Home because a
  // vet's day starts at the whiteboard, not at the booking list.
  { href: "/clinical", labelKey: "nav.clinical" },
  { href: "/clinic", labelKey: "nav.clinicWorkspace" },
  { href: "/patients", labelKey: "nav.patients" },
  { href: "/shared-records", labelKey: "nav.sharedRecords" },
  { href: "/bookings", labelKey: "nav.bookings" },
  { href: "/waitlist", labelKey: "nav.waitlist" },
  { href: "/calendar", labelKey: "nav.schedule" },
  { href: "/availability", labelKey: "nav.availability" },
  { href: "/services", labelKey: "nav.services" },
  { href: "/team", labelKey: "nav.team" },
  { href: "/reviews", labelKey: "nav.reviews" },
  { href: "/analytics", labelKey: "nav.analytics" },
  { href: "/travel", labelKey: "nav.travel" },
  // Only pet-taxi organizations take on-demand rides.
  { href: "/pet-taxi", labelKey: "nav.petTaxi", onlyFor: "PET_TAXI" },
] as const;

/**
 * A deliberately separate shell from the consumer AppShell (spec section
 * 27: "do not mix consumer and provider navigation") — same visual language
 * (ContextSurface/StatusLabel/theme tokens), completely different identity
 * axis: provider organization context instead of household/pet context.
 */
function LiveProviderShell({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const { isLoading: isProviderLoading } = useProviderBootstrap();
  const context = useProviderStore((s) => s.context);
  const status = useProviderStore((s) => s.status);
  const setContext = useProviderStore((s) => s.setContext);
  const t = useTranslations("provider.shell");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    let cancelled = false;
    authService
      .getSession()
      .then(() => !cancelled && setSessionState("authenticated"))
      .catch(() => !cancelled && setSessionState("unauthenticated"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionState === "unauthenticated") router.replace(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [sessionState, router, locale]);

  const [switching, setSwitching] = useState<string | null>(null);
  async function chooseOrganization(providerOrganizationId: string) {
    setSwitching(providerOrganizationId);
    try {
      const next = await providerOsService.setContext(providerOrganizationId);
      setContext(next);
    } finally {
      setSwitching(null);
    }
  }

  if (sessionState !== "authenticated" || isProviderLoading || status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={tCommon("loading")} />
      </div>
    );
  }

  if (status === "not-a-provider") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
        <ContextSurface className="max-w-sm text-center">
          <p className="text-section-title text-text-primary">{t("notAProvider.title")}</p>
          <p className="mt-2 text-body text-text-secondary">{t("notAProvider.body")}</p>
          <Button className="mt-4" variant="secondary" onClick={() => router.push(`/${locale}/home`)}>
            {t("notAProvider.backToApp")}
          </Button>
        </ContextSurface>
      </div>
    );
  }

  if (status === "ambiguous" && context) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
        <ContextSurface className="w-full max-w-sm">
          <p className="text-section-title text-text-primary">{t("chooseOrg.title")}</p>
          <p className="mt-1 text-body text-text-secondary">{t("chooseOrg.body")}</p>
          <div className="mt-4 flex flex-col gap-2">
            {context.memberships.map((m) => (
              <Button
                key={m.providerOrganizationId}
                variant="secondary"
                isLoading={switching === m.providerOrganizationId}
                onClick={() => chooseOrganization(m.providerOrganizationId)}
              >
                {m.organizationName}
              </Button>
            ))}
          </div>
        </ContextSurface>
      </div>
    );
  }

  if (!context?.active) return null;

  const active = context.active;
  const notVerified = active.verificationStatus !== "VERIFIED";
  const verificationRequired = notVerified && ["services", "availability", "calendar"].some((section) => {
    const prefix = `/${locale}/provider/${section}`;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });

  return (
    <div className="opl-page workspace-shell operator-shell min-h-screen">
      <header className="operator-shell__header">
        <div className="operator-shell__header-inner">
          <Link href={`/${locale}/business`} className="operator-shell__brand" aria-label={locale === "fa" ? "اپت لایف" : "opetlife"}><Brand compact locale={locale as RouteLocale} /></Link>
          <div className="flex flex-col">
            <span className="text-section-title text-text-primary">{active.organizationName}</span>
            <span className="text-metadata text-text-secondary">
              {t("headerRole", { role: t(`role.${active.role}`) })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {context.memberships.length > 1 ? (
              <Button variant="ghost" onClick={() => setContext({ ...context, active: null })}>
                {t("switchOrg")}
              </Button>
            ) : null}
            <BusinessConsoleLinks supportCategory="PROVIDER" />
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
        {notVerified ? (
          <div className="operator-shell__notice">
            <StatusLabel tone="attention">{t("notVerifiedBanner")}</StatusLabel>
            <Link className="ms-3 underline" href={`/${locale}/provider/verification`}>{t("nav.verification")}</Link>
          </div>
        ) : null}
      </header>

      <div className="operator-shell__nav-band"><nav className="operator-shell__nav" aria-label={t("nav.home")}>
        {NAV_ITEMS.filter((item) => !("onlyFor" in item) || item.onlyFor === active.organizationType).map((item) => {
          const href = `/${locale}/provider${item.href}`;
          const isActive = item.href === "" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className="shrink-0"
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav></div>

      <main className={pathname === `/${locale}/provider` ? "mx-auto max-w-2xl px-4 py-6" : "workspace-main operator-shell__main w-full min-w-0 px-4 py-6"}>{verificationRequired ? <VerificationRequiredNotice /> : children}</main>
    </div>
  );
}

export function ProviderShell({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("provider.shell");
  return <LocalPreviewGate title="provider" items={NAV_ITEMS.filter((item) => !("onlyFor" in item)).map(item => ({ href: `/${locale}/provider${item.href}`, label: t(item.labelKey) }))} live={<LiveProviderShell>{children}</LiveProviderShell>}>{children}</LocalPreviewGate>;
}
