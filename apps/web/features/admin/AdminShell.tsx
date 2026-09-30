"use client";

import { useLocalPreview } from "@/features/local-preview/LocalPreviewGate";
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
type NavItem = { href: string; labelKey: string; permission?: AdminPermissionName };
type NavGroup = { id: string; label: { en: string; fa: string }; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: { en: "Overview", fa: "نمای کلی" }, items: [{ href: "", labelKey: "nav.dashboard" }] },
  { id: "customers", label: { en: "Customers", fa: "مشتریان" }, items: [
    { href: "/customers", labelKey: "nav.customers", permission: "customer.view" },
    { href: "/crm", labelKey: "nav.crm", permission: "customer.view" },
    { href: "/customer-affairs", labelKey: "nav.customerAffairs", permission: "support.view" },
  ] },
  { id: "partners", label: { en: "Partners", fa: "همکاران" }, items: [
    { href: "/providers", labelKey: "nav.providers", permission: "verification.manage" },
    { href: "/sellers", labelKey: "nav.sellers", permission: "verification.manage" },
    { href: "/places", labelKey: "nav.places", permission: "places.view" },
    { href: "/insurance", labelKey: "nav.insurance", permission: "insurance.applications.view" },
  ] },
  { id: "operations", label: { en: "Commerce & services", fa: "فروشگاه و خدمات" }, items: [
    { href: "/commerce", labelKey: "nav.commerce", permission: "commerce.view" },
    { href: "/services", labelKey: "nav.services", permission: "services.view" },
    { href: "/travel", labelKey: "nav.travel", permission: "travel.view" },
    { href: "/subscriptions", labelKey: "nav.subscriptions", permission: "subscription.view" },
  ] },
  { id: "finance", label: { en: "Finance", fa: "مالی" }, items: [
    { href: "/transactions", labelKey: "nav.transactions", permission: "finance.view" },
    { href: "/seller-finance", labelKey: "nav.sellerFinance", permission: "sellerFinance.view" },
    { href: "/reconciliation", labelKey: "nav.reconciliation", permission: "sellerFinance.view" },
  ] },
  { id: "support", label: { en: "Support & safety", fa: "پشتیبانی و امنیت" }, items: [
    { href: "/support", labelKey: "nav.support", permission: "support.view" },
    { href: "/disputes", labelKey: "nav.disputes", permission: "dispute.view" },
    { href: "/trust", labelKey: "nav.trust", permission: "trust.view" },
    { href: "/tasks", labelKey: "nav.tasks", permission: "task.manage" },
  ] },
  { id: "content", label: { en: "Content", fa: "محتوا" }, items: [
    { href: "/content", labelKey: "nav.content", permission: "content.view" },
    { href: "/content/new", labelKey: "nav.contentNew", permission: "content.create" },
    { href: "/content/categories", labelKey: "nav.contentCategories", permission: "content.view" },
    { href: "/content/tags", labelKey: "nav.contentTags", permission: "content.view" },
    { href: "/content/media", labelKey: "nav.contentMedia", permission: "content.view" },
    { href: "/content/placements", labelKey: "nav.contentPlacements", permission: "content.view" },
  ] },
  { id: "audit", label: { en: "Control", fa: "کنترل" }, items: [{ href: "/audit", labelKey: "nav.audit", permission: "audit.view" }] },
];

const isActiveRoute = (pathname: string, href: string) => href === "" ? pathname.endsWith("/admin") : pathname.includes(`/admin${href}`);

function AdminPreviewShell({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("admin.shell");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigation = <nav aria-label={locale === "fa" ? "ناوبری مدیریت" : "Admin navigation"} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
    {NAV_GROUPS.map((group) => <section key={group.id} aria-labelledby={`admin-preview-nav-${group.id}`}>
      <h2 id={`admin-preview-nav-${group.id}`} className="px-3 pb-1 text-metadata font-medium text-text-secondary">{group.label[locale === "fa" ? "fa" : "en"]}</h2>
      <div className="space-y-0.5">{group.items.map((item) => {
        const href = `/${locale}/admin${item.href}`;
        const active = isActiveRoute(pathname, item.href);
        return <Link key={item.href} href={href} onClick={() => setIsDrawerOpen(false)} className={`block rounded-lg px-3 py-2 text-body transition-colors ${active ? "bg-surface-subtle font-medium text-text-primary" : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary"}`} aria-current={active ? "page" : undefined}>{t(item.labelKey)}</Link>;
      })}</div>
    </section>)}
  </nav>;

  return <div className="min-h-screen bg-surface-base">
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle bg-surface-base px-4">
      <div className="flex min-w-0 items-center gap-2"><button type="button" className="inline-flex size-9 items-center justify-center rounded-lg text-text-primary hover:bg-surface-subtle lg:hidden" aria-label={locale === "fa" ? "باز کردن منو" : "Open navigation"} aria-expanded={isDrawerOpen} onClick={() => setIsDrawerOpen(true)}><span aria-hidden className="text-xl leading-none">☰</span></button><div className="min-w-0"><p className="truncate text-metadata font-medium text-text-primary">{t("title")}</p><p className="truncate text-metadata text-text-secondary">{locale === "fa" ? "پیش‌نمایش محلی" : "Local preview"}</p></div></div>
      <div className="flex shrink-0 items-center gap-2"><LocaleSwitcher /><ThemeToggle /></div>
    </header>
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"><aside className="hidden h-[calc(100vh-3.5rem)] border-e border-border-subtle bg-surface-base lg:sticky lg:top-0 lg:flex lg:flex-col">{navigation}</aside><main className="min-w-0 px-4 py-4 sm:px-6 lg:px-8"><p className="mb-4 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-metadata text-text-secondary" role="status">{locale === "fa" ? "پیش‌نمایش محلی بدون ورود. اطلاعات خصوصی به اتصال API و نشست معتبر نیاز دارد؛ عملیات ذخیره و پرداخت در این حالت غیرفعال است." : "Local preview without sign-in. Private data requires a connected API and valid session; saving and payments are disabled in this mode."}</p>{children}</main></div>
    {isDrawerOpen ? <div className="fixed inset-0 z-50 lg:hidden" role="presentation"><button type="button" aria-label={locale === "fa" ? "بستن منو" : "Close navigation"} className="absolute inset-0 bg-black/30" onClick={() => setIsDrawerOpen(false)} /><aside role="dialog" aria-modal="true" aria-label={locale === "fa" ? "منوی مدیریت" : "Admin menu"} className="absolute inset-y-0 start-0 flex w-72 max-w-[calc(100vw-2rem)] flex-col border-e border-border-subtle bg-surface-base shadow-lg"><div className="flex h-14 items-center justify-between border-b border-border-subtle px-4"><p className="text-body font-medium text-text-primary">{t("title")}</p><button type="button" className="inline-flex size-9 items-center justify-center rounded-lg text-text-primary hover:bg-surface-subtle" onClick={() => setIsDrawerOpen(false)} aria-label={locale === "fa" ? "بستن منو" : "Close navigation"}>×</button></div>{navigation}</aside></div> : null}
  </div>;
}

/** Separate operational shell. Nav only exposes real, permitted routes. */
function LiveAdminShell({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
    authService.getSession().then(() => !cancelled && setSessionState("authenticated")).catch(() => !cancelled && setSessionState("unauthenticated"));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (sessionState === "unauthenticated") router.replace(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [sessionState, router, locale]);

  if (sessionState !== "authenticated" || isLoading || status === "idle") {
    return <div className="flex min-h-screen items-center justify-center bg-surface-base"><Skeleton className="h-8 w-40" aria-label={tCommon("loading")} /></div>;
  }

  if (status === "not-an-admin" || !context?.isAdmin) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-base px-4"><ContextSurface className="max-w-sm text-center"><p className="text-section-title text-text-primary">{t("notAnAdmin.title")}</p><p className="mt-2 text-body text-text-secondary">{t("notAnAdmin.body")}</p><Button className="mt-4" variant="secondary" onClick={() => router.push(`/${locale}/home`)}>{t("notAnAdmin.backToApp")}</Button></ContextSurface></div>;
  }

  const permissions = new Set(context.permissions);
  const visibleGroups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || permissions.has(item.permission)) })).filter((group) => group.items.length > 0);
  const navigation = <nav aria-label={locale === "fa" ? "ناوبری مدیریت" : "Admin navigation"} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
    {visibleGroups.map((group) => <section key={group.id} aria-labelledby={`admin-nav-${group.id}`}>
      <h2 id={`admin-nav-${group.id}`} className="px-3 pb-1 text-metadata font-medium text-text-secondary">{group.label[locale === "fa" ? "fa" : "en"]}</h2>
      <div className="space-y-0.5">{group.items.map((item) => {
        const href = `/${locale}/admin${item.href}`;
        const active = isActiveRoute(pathname, item.href);
        return <Link key={item.href} href={href} onClick={() => setIsDrawerOpen(false)} className={`block rounded-lg px-3 py-2 text-body transition-colors ${active ? "bg-surface-subtle font-medium text-text-primary" : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary"}`} aria-current={active ? "page" : undefined}>{t(item.labelKey)}</Link>;
      })}</div>
    </section>)}
  </nav>;

  return <div className="min-h-screen bg-surface-base">
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle bg-surface-base px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" className="inline-flex size-9 items-center justify-center rounded-lg text-text-primary hover:bg-surface-subtle lg:hidden" aria-label={locale === "fa" ? "باز کردن منو" : "Open navigation"} aria-expanded={isDrawerOpen} onClick={() => setIsDrawerOpen(true)}><span aria-hidden className="text-xl leading-none">☰</span></button>
        <div className="min-w-0"><p className="truncate text-metadata font-medium text-text-primary">{t("title")}</p><p className="truncate text-metadata text-text-secondary">{context.displayName} · {t(`role.${context.role}`)}</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-2"><LocaleSwitcher /><ThemeToggle /></div>
    </header>
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden h-[calc(100vh-3.5rem)] border-e border-border-subtle bg-surface-base lg:sticky lg:top-0 lg:flex lg:flex-col">{navigation}</aside>
      <main className="min-w-0 px-4 py-4 sm:px-6 lg:px-8">{children}</main>
    </div>
    {isDrawerOpen ? <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
      <button type="button" aria-label={locale === "fa" ? "بستن منو" : "Close navigation"} className="absolute inset-0 bg-black/30" onClick={() => setIsDrawerOpen(false)} />
      <aside role="dialog" aria-modal="true" aria-label={locale === "fa" ? "منوی مدیریت" : "Admin menu"} className="absolute inset-y-0 start-0 flex w-72 max-w-[calc(100vw-2rem)] flex-col border-e border-border-subtle bg-surface-base shadow-lg">
        <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4"><p className="text-body font-medium text-text-primary">{t("title")}</p><button type="button" className="inline-flex size-9 items-center justify-center rounded-lg text-text-primary hover:bg-surface-subtle" onClick={() => setIsDrawerOpen(false)} aria-label={locale === "fa" ? "بستن منو" : "Close navigation"}>×</button></div>
        {navigation}
      </aside>
    </div> : null}
  </div>;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const preview = useLocalPreview();
  if (preview === null) return null;
  return preview ? <AdminPreviewShell>{children}</AdminPreviewShell> : <LiveAdminShell>{children}</LiveAdminShell>;
}
