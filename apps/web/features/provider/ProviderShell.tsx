"use client";

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

type SessionState = "loading" | "authenticated" | "unauthenticated";

const NAV_ITEMS = [
  { href: "", labelKey: "nav.home" },
  { href: "/bookings", labelKey: "nav.bookings" },
  { href: "/calendar", labelKey: "nav.schedule" },
  { href: "/availability", labelKey: "nav.availability" },
  { href: "/services", labelKey: "nav.services" },
  { href: "/team", labelKey: "nav.team" },
] as const;

/**
 * A deliberately separate shell from the consumer AppShell (spec section
 * 27: "do not mix consumer and provider navigation") — same visual language
 * (ContextSurface/StatusLabel/theme tokens), completely different identity
 * axis: provider organization context instead of household/pet context.
 */
export function ProviderShell({ children }: { children: React.ReactNode }) {
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
    if (sessionState === "unauthenticated") router.replace(`/${locale}/welcome`);
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

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-3">
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
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
        {notVerified ? (
          <div className="mt-2">
            <StatusLabel tone="attention">{t("notVerifiedBanner")}</StatusLabel>
          </div>
        ) : null}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle px-4 py-2">
        {NAV_ITEMS.map((item) => {
          const href = `/${locale}/provider${item.href}`;
          const isActive = item.href === "" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={
                "shrink-0 rounded-full px-3 py-1.5 text-metadata " +
                (isActive ? "bg-surface-subtle text-text-primary" : "text-text-secondary")
              }
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
