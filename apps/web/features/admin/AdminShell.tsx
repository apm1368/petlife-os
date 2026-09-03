"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { AdminPermissionName } from "@petlife/types";
import { Button, ContextSurface, Skeleton } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { useAdminBootstrap } from "@/hooks/use-admin-bootstrap";
import { useAdminStore } from "@/stores/admin-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";

type SessionState = "loading" | "authenticated" | "unauthenticated";

const NAV_ITEMS: { href: string; labelKey: string; permission?: AdminPermissionName }[] = [
  { href: "", labelKey: "nav.dashboard" },
  { href: "/customers", labelKey: "nav.customers", permission: "customer.view" },
  { href: "/support", labelKey: "nav.support", permission: "support.view" },
  { href: "/disputes", labelKey: "nav.disputes", permission: "dispute.view" },
  { href: "/trust", labelKey: "nav.trust", permission: "trust.view" },
  { href: "/providers", labelKey: "nav.providers", permission: "verification.manage" },
  { href: "/sellers", labelKey: "nav.sellers", permission: "verification.manage" },
  { href: "/transactions", labelKey: "nav.transactions", permission: "finance.view" },
  { href: "/seller-finance", labelKey: "nav.sellerFinance", permission: "sellerFinance.view" },
  { href: "/reconciliation", labelKey: "nav.reconciliation", permission: "sellerFinance.view" },
  { href: "/content", labelKey: "nav.content", permission: "content.view" },
  { href: "/content/media", labelKey: "nav.contentMedia", permission: "content.view" },
  { href: "/content/placements", labelKey: "nav.contentPlacements", permission: "content.view" },
  { href: "/tasks", labelKey: "nav.tasks", permission: "task.manage" },
  { href: "/audit", labelKey: "nav.audit", permission: "audit.view" },
];

/**
 * A deliberately separate shell — not the consumer AppShell, not
 * SellerShell/ProviderShell (spec: "distinct Admin frontend shell, not
 * reusing consumer navigation"). No org-switching concept, unlike
 * Seller/Provider: an AdminUser has exactly one role. Nav items are
 * filtered by the resolved permission list purely as a convenience — every
 * `/admin/*` route is independently guarded server-side, so hiding a link
 * here is never itself the security boundary.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const { isLoading } = useAdminBootstrap();
  const context = useAdminStore((s) => s.context);
  const status = useAdminStore((s) => s.status);
  const t = useTranslations("admin.shell");
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

  if (sessionState !== "authenticated" || isLoading || status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={tCommon("loading")} />
      </div>
    );
  }

  if (status === "not-an-admin" || !context?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
        <ContextSurface className="max-w-sm text-center">
          <p className="text-section-title text-text-primary">{t("notAnAdmin.title")}</p>
          <p className="mt-2 text-body text-text-secondary">{t("notAnAdmin.body")}</p>
          <Button className="mt-4" variant="secondary" onClick={() => router.push(`/${locale}/home`)}>
            {t("notAnAdmin.backToApp")}
          </Button>
        </ContextSurface>
      </div>
    );
  }

  const permissions = new Set(context.permissions);
  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || permissions.has(item.permission));

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
        <div className="flex flex-col">
          <span className="text-metadata font-medium text-text-primary">{t("title")}</span>
          <span className="text-metadata text-text-secondary">{context.displayName} · {t(`role.${context.role}`)}</span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle px-4 py-1.5">
        {visibleItems.map((item) => {
          const href = `/${locale}/admin${item.href}`;
          const isActive = item.href === "" ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={item.href} href={href} className={"shrink-0 rounded-full px-3 py-1 text-metadata " + (isActive ? "bg-surface-subtle text-text-primary" : "text-text-secondary")}>
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-4">{children}</main>
    </div>
  );
}
