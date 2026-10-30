"use client";
import styles from "./AdminShell.module.css";
import { Brand } from "@/features/brand/Brand";
import { LocalPreviewGate } from "@/features/local-preview/LocalPreviewGate";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { AdminPermissionName } from "@petlife/types";
import { Button, ClipboardList, Users, ShoppingBag, Receipt, FileText, SlidersHorizontal, House, ChevronDown, ContextSurface, IconButton, Menu, Sheet, Skeleton, X } from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { adminService } from "@/services/admin.service";
import { useAdminBootstrap } from "@/hooks/use-admin-bootstrap";
import { useAdminStore } from "@/stores/admin-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";

type SessionState = "loading" | "authenticated" | "unauthenticated";

const NAV_ITEMS: { href: string; labelKey: string; permission?: AdminPermissionName | AdminPermissionName[] }[] = [
  { href: "", labelKey: "nav.dashboard" },
  { href: "/crm", labelKey: "nav.crm", permission: "customer.view" },
  { href: "/customer-affairs", labelKey: "nav.customerAffairs", permission: "support.view" },
  { href: "/customers", labelKey: "nav.customers", permission: "customer.view" },
  { href: "/users", labelKey: "nav.users", permission: "customer.view" },
  { href: "/support", labelKey: "nav.support", permission: "support.view" },
  { href: "/disputes", labelKey: "nav.disputes", permission: "dispute.view" },
  { href: "/trust", labelKey: "nav.trust", permission: "trust.view" },
  { href: "/community", labelKey: "nav.communityReports", permission: "trust.view" },
  { href: "/animal-support", labelKey: "nav.animalSupport", permission: "animalSupport.view" },
  { href: "/lost-pets", labelKey: "nav.lostPets", permission: "trust.view" },
  { href: "/verification", labelKey: "nav.verification", permission: "verification.manage" },
  { href: "/providers", labelKey: "nav.providers", permission: ["verification.manage", "customer.view"] },
  { href: "/services", labelKey: "nav.services", permission: "services.view" },
  { href: "/commerce", labelKey: "nav.commerce", permission: "commerce.view" },
  { href: "/travel", labelKey: "nav.travel", permission: "travel.view" },
  { href: "/insurance", labelKey: "nav.insurance", permission: "insurance.applications.view" },
  { href: "/places", labelKey: "nav.places", permission: "places.view" },
  { href: "/sellers", labelKey: "nav.sellers", permission: ["verification.manage", "customer.view"] },
  { href: "/transactions", labelKey: "nav.transactions", permission: "finance.view" },
  { href: "/seller-finance", labelKey: "nav.sellerFinance", permission: "sellerFinance.view" },
  { href: "/reconciliation", labelKey: "nav.reconciliation", permission: "sellerFinance.view" },
  { href: "/content", labelKey: "nav.content", permission: "content.view" },
  { href: "/content/new", labelKey: "nav.contentNew", permission: "content.create" },
  { href: "/content/categories", labelKey: "nav.contentCategories", permission: "content.view" },
  { href: "/content/tags", labelKey: "nav.contentTags", permission: "content.view" },
  { href: "/content/media", labelKey: "nav.contentMedia", permission: "content.view" },
  { href: "/content/placements", labelKey: "nav.contentPlacements", permission: "content.view" },
  { href: "/subscriptions", labelKey: "nav.subscriptions", permission: "subscription.view" },
  { href: "/tasks", labelKey: "nav.tasks", permission: "task.manage" },
  { href: "/access", labelKey: "nav.access", permission: "access.view" },
  { href: "/settings", labelKey: "nav.settings", permission: "settings.view" },
  { href: "/audit", labelKey: "nav.audit", permission: "audit.view" },
];

/** Sample-data workspaces with no backend: shown only in the local design preview, never to real admins (decision 5). */
const PREVIEW_ONLY_HREFS = new Set(["/crm", "/customer-affairs"]);

/** ERP information architecture: the same items grouped by job — six groups instead of a flat link list. */
const NAV_GROUPS: { key: string; hrefs: string[] }[] = [
  { key: "work", hrefs: ["/tasks", "/crm", "/customer-affairs"] },
  { key: "trust", hrefs: ["/users", "/customers", "/support", "/disputes", "/trust", "/community", "/lost-pets", "/animal-support"] },
  { key: "network", hrefs: ["/verification", "/providers", "/services", "/sellers", "/commerce", "/travel", "/insurance", "/places"] },
  { key: "finance", hrefs: ["/transactions", "/seller-finance", "/reconciliation", "/subscriptions"] },
  { key: "content", hrefs: ["/content", "/content/new", "/content/categories", "/content/tags", "/content/media", "/content/placements"] },
  { key: "system", hrefs: ["/access", "/settings", "/audit"] },
];

const GROUP_ICONS = { work: ClipboardList, trust: Users, network: ShoppingBag, finance: Receipt, content: FileText, system: SlidersHorizontal };

/**
 * A deliberately separate shell — not the consumer AppShell, not
 * SellerShell/ProviderShell (spec: "distinct Admin frontend shell, not
 * reusing consumer navigation"). No org-switching concept, unlike
 * Seller/Provider: an AdminUser has exactly one role. Nav items are
 * filtered by the resolved permission list purely as a convenience — every
 * `/admin/*` route is independently guarded server-side, so hiding a link
 * here is never itself the security boundary.
 */
function LiveAdminShell({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [trustCount, setTrustCount] = useState<number | null>(null);
  const { isLoading, error: bootstrapError, retry: retryBootstrap } = useAdminBootstrap();
  const context = useAdminStore((s) => s.context);
  const status = useAdminStore((s) => s.status);
  const canViewTrust = !!context?.permissions.includes("trust.view");
  useEffect(() => {
    let cancelled = false;
    setTrustCount(null);
    if (canViewTrust) Promise.resolve().then(() => adminService.getTrustQueueSummary()).then(q => { if (!cancelled) setTrustCount(q.total); }).catch(() => { if (!cancelled) setTrustCount(null); });
    return () => { cancelled = true; };
  }, [canViewTrust]);
  const t = useTranslations("admin.shell");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => { setOpenGroup(null); }, [pathname]);

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

  if (sessionState !== "authenticated" || isLoading || status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={tCommon("loading")} />
      </div>
    );
  }

  if (bootstrapError) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
      <ContextSurface className="max-w-sm space-y-4 text-center">
        <p role="alert">{t("accessLoadFailed")}</p>
        <Button onClick={retryBootstrap}>{tCommon("retry")}</Button>
      </ContextSurface>
    </div>;
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
  const visibleItems = NAV_ITEMS.filter((item) => !PREVIEW_ONLY_HREFS.has(item.href) && (!item.permission || (Array.isArray(item.permission) ? item.permission.some(permission => permissions.has(permission)) : permissions.has(item.permission))));
  const visible = new Map(visibleItems.map((item) => [item.href, item]));
  const activeHref = visibleItems.map((i) => i.href).filter((h) => (h === "" ? pathname === `/${locale}/admin` : pathname.startsWith(`/${locale}/admin${h}`))).sort((a, b) => b.length - a.length)[0];
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.hrefs.map((h) => visible.get(h)).filter((i): i is NonNullable<typeof i> => Boolean(i)) })).filter((g) => g.items.length);
  const groupOf = (href?: string) => groups.find((g) => g.items.some((i) => i.href === href))?.key;
  const itemLink = (item: (typeof visibleItems)[number], onClick?: () => void) => (
    <Link key={item.href} href={`/${locale}/admin${item.href}`} onClick={onClick} aria-current={activeHref === item.href ? "page" : undefined} className={styles.link}>{item.href === "" ? <House size={20} aria-hidden="true" /> : null}{t(item.labelKey)}</Link>
  );

  return (
    <div className={`erp-shell ${styles.shell}`}>
      <aside className={styles.sidebar}>
        <Link href={`/${locale}/admin`} className={styles.brand}><Brand /><span>{t("title")}</span></Link>
        <nav className={styles.navigation} aria-label={t("navigation")}>
          {itemLink(visible.get("")!)}
          {groups.map((g) => {
            const GroupIcon = GROUP_ICONS[g.key as keyof typeof GROUP_ICONS];
            const expanded = openGroup === g.key || (openGroup === null && groupOf(activeHref) === g.key);
            return <div key={g.key} className={styles.group}>
              <button type="button" className={styles.groupButton} aria-expanded={expanded} aria-controls={`admin-nav-${g.key}`} onClick={() => setOpenGroup(expanded ? "" : g.key)}>
                <GroupIcon size={20} aria-hidden="true" /><span>{t(`groups.${g.key}`)}</span>
                {g.key === "trust" && trustCount ? <span className={styles.count}>{trustCount.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</span> : null}
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {expanded ? <div id={`admin-nav-${g.key}`} className={styles.groupLinks}>{g.items.map(i => itemLink(i))}</div> : null}
            </div>;
          })}
        </nav>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.mobileMenu}><IconButton label={t("openMenu")} onClick={() => setMenuOpen(true)} icon={<Menu size={20} aria-hidden="true" />} /></span>
            <Link href={`/${locale}/admin`} className={styles.headerBrand} aria-label={t("title")}><Brand compact /></Link>
            <span className={styles.title}>{t("title")}</span>
          </div>
          <div className={styles.tools}>
            <LocaleSwitcher />
            <ThemeToggle />
            <div className={styles.user}><span>{context.displayName || t(`role.${context.role}`)}</span><small>{t(`role.${context.role}`)}</small></div>
          </div>
        </header>
        <main className={`erp-main workspace-main w-full min-w-0 ${styles.main}`}>{children}</main>
      </div>
      {menuOpen ? (
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("navigation")}>
          <div className="flex justify-end"><IconButton label={t("closeMenu")} onClick={() => setMenuOpen(false)} icon={<X size={20} aria-hidden="true" />} /></div>
          <nav className={styles.sheetNavigation} aria-label={t("navigation")}>
            {itemLink(visible.get("")!, () => setMenuOpen(false))}
            {groups.map(g => <div key={g.key}><p>{t(`groups.${g.key}`)}</p>{g.items.map(i => itemLink(i, () => setMenuOpen(false)))}</div>)}
          </nav>
        </Sheet>
      ) : null}
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("admin.shell");
  return <LocalPreviewGate title="admin" items={NAV_ITEMS.map(item => ({ href: `/${locale}/admin${item.href}`, label: t(item.labelKey) }))} live={<LiveAdminShell>{children}</LiveAdminShell>}>{children}</LocalPreviewGate>;
}
