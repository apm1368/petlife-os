"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Skeleton, StatusLabel } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerBootstrap } from "@/hooks/use-seller-bootstrap";
import { useSellerStore } from "@/stores/seller-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";

type SessionState = "loading" | "authenticated" | "unauthenticated";

const NAV_ITEMS = [
  { href: "", labelKey: "nav.overview" },
  { href: "/orders", labelKey: "nav.orders" },
  { href: "/offers", labelKey: "nav.offers" },
  { href: "/inventory", labelKey: "nav.inventory" },
  { href: "/channels", labelKey: "nav.channels" },
  { href: "/finance", labelKey: "nav.finance" },
  { href: "/team", labelKey: "nav.team" },
  { href: "/settings", labelKey: "nav.settings" },
] as const;

/**
 * A deliberately separate shell from the consumer AppShell and the Provider
 * Shell (spec section 47) — same visual language (ContextSurface/
 * StatusLabel/theme tokens), a third distinct identity axis: seller
 * organization membership. Mirrors ProviderShell's bootstrap/context-switch
 * pattern (Handoff 05) exactly, since Seller OS's SellerContextDto has the
 * identical active/memberships shape.
 */
export function SellerShell({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const { isLoading: isSellerLoading } = useSellerBootstrap();
  const context = useSellerStore((s) => s.context);
  const status = useSellerStore((s) => s.status);
  const setContext = useSellerStore((s) => s.setContext);
  const t = useTranslations("seller.shell");
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
  async function chooseOrganization(sellerOrganizationId: string) {
    setSwitching(sellerOrganizationId);
    try {
      const next = await sellerOsService.setContext(sellerOrganizationId);
      setContext(next);
    } finally {
      setSwitching(null);
    }
  }

  if (sessionState !== "authenticated" || isSellerLoading || status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={tCommon("loading")} />
      </div>
    );
  }

  if (status === "not-a-seller") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
        <ContextSurface className="max-w-sm text-center">
          <p className="text-section-title text-text-primary">{t("notASeller.title")}</p>
          <p className="mt-2 text-body text-text-secondary">{t("notASeller.body")}</p>
          <Button className="mt-4" variant="secondary" onClick={() => router.push(`/${locale}/home`)}>
            {t("notASeller.backToApp")}
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
              <Button key={m.sellerOrganizationId} variant="secondary" isLoading={switching === m.sellerOrganizationId} onClick={() => chooseOrganization(m.sellerOrganizationId)}>
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
  const suspended = active.sellerStatus === "SUSPENDED" || active.sellerStatus === "RESTRICTED" || active.sellerStatus === "CLOSED";

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-section-title text-text-primary">{active.organizationName}</span>
            <span className="text-metadata text-text-secondary">{t("headerRole", { role: t(`role.${active.role}`) })}</span>
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
        {suspended ? (
          <div className="mt-2">
            <StatusLabel tone="urgent">{t("suspendedBanner")}</StatusLabel>
          </div>
        ) : null}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle px-4 py-2">
        {NAV_ITEMS.map((item) => {
          const href = `/${locale}/seller${item.href}`;
          const isActive = item.href === "" ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={item.href} href={href} className={"shrink-0 rounded-full px-3 py-1.5 text-metadata " + (isActive ? "bg-surface-subtle text-text-primary" : "text-text-secondary")}>
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
