"use client";
import styles from "./AdminShell.module.css";
import "@/features/landing/opl/opl-landing.css";
import "./admin-glass.css";
import { Brand } from "@/features/brand/Brand";
import { LocalPreviewGate } from "@/features/local-preview/LocalPreviewGate";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { AdminSearchResultDto } from "@petlife/types";
import type { RouteLocale } from "@/lib/i18n/config";
import {
  Button,
  ChevronDown,
  ChevronRight,
  ContextSurface,
  ExternalLink,
  FileText,
  Headset,
  House,
  IconButton,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sheet,
  ShoppingBag,
  Skeleton,
  UserRound,
  X,
} from "@petlife/ui";
import { authService } from "@/services/auth.service";
import { adminService } from "@/services/admin.service";
import { useAdminBootstrap } from "@/hooks/use-admin-bootstrap";
import { useAdminStore } from "@/stores/admin-store";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";
import { useSignOut } from "@/features/account/use-sign-out";
import {
  ADMIN_SECTIONS,
  matchRoute,
  moduleQueueCount,
  visibleSections,
  type RouteMatch,
  type VisibleModule,
  type VisibleSection,
} from "./admin-nav";
import { refreshQueues, resetQueues, useQueues } from "./admin-queues";

type SessionState = "loading" | "authenticated" | "unauthenticated";
type Summary = ReturnType<typeof useQueues>["summary"];

/** Sample-data workspaces with no backend: listed only in the local design preview, never to real admins (decision 5). */
const PREVIEW_ONLY = [
  { href: "/crm", labelKey: "nav.crm" },
  { href: "/customer-affairs", labelKey: "nav.customerAffairs" },
];
const SIDEBAR_KEY = "petlife.admin.sidebar";
const NUMBER_LOCALE: Record<string, string> = { fa: "fa-IR", en: "en-GB", de: "de-DE", es: "es-ES" };
/** Leaf path words that name a page of their own below a record; any other segment is a record id. */
const NAMED_SEGMENTS = new Set(["new", "versions", "products"]);

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/**
 * A deliberately separate shell — not the consumer AppShell, not SellerShell/ProviderShell (spec: "distinct
 * Admin frontend shell, not reusing consumer navigation"). Layout follows the common back-office pattern:
 * a sectioned sidebar with queue badges, a top bar with breadcrumbs, search and the account menu, then the
 * module's tabs above the page. Nav items are filtered by the resolved permission list purely as a
 * convenience — every `/admin/*` route is independently guarded server-side.
 */
function LiveAdminShell({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isLoading, error: bootstrapError, retry: retryBootstrap } = useAdminBootstrap();
  const context = useAdminStore((s) => s.context);
  const status = useAdminStore((s) => s.status);
  const { summary } = useQueues();
  const t = useTranslations("admin.shell");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const ready = sessionState === "authenticated" && status === "ready" && !!context?.isAdmin;

  useEffect(() => setCollapsed(readCollapsed()), []);
  useEffect(() => {
    setPaletteOpen(false);
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (ready) void refreshQueues();
  }, [ready, pathname]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => void refreshQueues(true), 120_000);
    return () => window.clearInterval(timer);
  }, [ready]);
  useEffect(() => {
    if (!context?.adminUserId) resetQueues();
  }, [context?.adminUserId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    if (sessionState === "unauthenticated")
      router.replace(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [sessionState, router, locale]);

  const permissions = useMemo(() => new Set<string>(context?.permissions ?? []), [context?.permissions]);
  const sections = useMemo(() => visibleSections(permissions), [permissions]);
  const adminPath = pathname.replace(new RegExp(`^/${locale}/admin`), "").replace(/\/$/, "");
  const match = useMemo(() => matchRoute(sections, adminPath), [sections, adminPath]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, value ? "expanded" : "collapsed");
      } catch {
        /* a private window keeps the choice for this page only */
      }
      return !value;
    });
  }, []);

  if (sessionState !== "authenticated" || isLoading || status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Skeleton className="h-8 w-40" aria-label={tCommon("loading")} />
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base px-4">
        <ContextSurface className="max-w-sm space-y-4 text-center">
          <p role="alert">{t("accessLoadFailed")}</p>
          <Button onClick={retryBootstrap}>{tCommon("retry")}</Button>
        </ContextSurface>
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

  const roleLabel = t.has(`role.${context.role}`) ? t(`role.${context.role}`) : String(context.role ?? "").replace(/_/g, " ");
  const displayName = context.displayName || roleLabel;
  const formatCount = (value: number) => new Intl.NumberFormat(NUMBER_LOCALE[locale] ?? "en-GB").format(value);
  const href = (path: string) => `/${locale}/admin${path}`;

  const nav = (onNavigate?: () => void) => (
    <SidebarNav
      sections={sections}
      match={match}
      summary={summary}
      collapsed={collapsed && !onNavigate}
      idSuffix={onNavigate ? "sheet" : "side"}
      href={href}
      formatCount={formatCount}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className={`opl-page erp-shell ${styles.shell}`} data-collapsed={collapsed ? "true" : undefined}>
      <a href="#admin-main" className={styles.skip}>
        {t("skipToContent")}
      </a>
      <aside className={styles.sidebar} aria-label={t("navigation")}>
        <div className={styles.sidebarTop}>
          <Link href={href("")} className={styles.brand} aria-label={t("title")}>
            <Brand compact={collapsed} locale={locale as RouteLocale} />
            {!collapsed ? <span>{t("console")}</span> : null}
          </Link>
          <button
            type="button"
            className={styles.collapse}
            onClick={toggleCollapsed}
            aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
            aria-pressed={collapsed}
            title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          >
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        </div>
        <button
          type="button"
          className={styles.search}
          onClick={() => setPaletteOpen(true)}
          aria-keyshortcuts="Control+K Meta+K"
          aria-label={collapsed ? t("palette.trigger") : undefined}
          title={collapsed ? t("palette.trigger") : undefined}
        >
          <Search size={17} aria-hidden="true" />
          {!collapsed ? (
            <>
              <span>{t("palette.trigger")}</span>
              <kbd>Ctrl K</kbd>
            </>
          ) : null}
        </button>
        {nav()}
        <UserMenu name={displayName} role={roleLabel} compact={collapsed} placement="up" />
      </aside>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.mobileMenu}>
              <IconButton label={t("openMenu")} onClick={() => setMenuOpen(true)} icon={<Menu size={20} aria-hidden="true" />} />
            </span>
            <Link href={href("")} className={styles.headerBrand} aria-label={t("title")}>
              <Brand compact locale={locale as RouteLocale} />
            </Link>
            <Breadcrumbs match={match} href={href} />
          </div>
          <div className={styles.tools}>
            <button type="button" className={styles.headerSearch} onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Control+K Meta+K">
              <Search size={17} aria-hidden="true" />
              <span>{t("palette.trigger")}</span>
            </button>
            <LocaleSwitcher />
            <ThemeToggle />
            <span className={styles.headerUser}>
              <UserMenu name={displayName} role={roleLabel} compact placement="down" />
            </span>
          </div>
        </header>
        <main id="admin-main" tabIndex={-1} className={`erp-main workspace-main w-full min-w-0 ${styles.main}`}>
          {match && match.module.visibleTabs.length > 1 ? (
            <ModuleTabs mod={match.module} activeHref={match.tab?.href} summary={summary} href={href} formatCount={formatCount} />
          ) : null}
          {children}
        </main>
      </div>
      {paletteOpen ? <CommandPalette sections={sections} permissions={permissions} onClose={() => setPaletteOpen(false)} /> : null}
      {menuOpen ? (
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("navigation")}>
          <div className="flex justify-end">
            <IconButton label={t("closeMenu")} onClick={() => setMenuOpen(false)} icon={<X size={20} aria-hidden="true" />} />
          </div>
          <div className={styles.sheetNavigation}>{nav(() => setMenuOpen(false))}</div>
        </Sheet>
      ) : null}
    </div>
  );
}

function SidebarNav({
  sections,
  match,
  summary,
  collapsed,
  idSuffix,
  href,
  formatCount,
  onNavigate,
}: {
  sections: VisibleSection[];
  match: RouteMatch | null;
  summary: Summary;
  collapsed: boolean;
  idSuffix: string;
  href: (path: string) => string;
  formatCount: (value: number) => string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("admin.shell");
  return (
    <nav className={styles.navigation} aria-label={t("navigation")}>
      {sections.map((section) => {
        const labelId = `admin-nav-${section.key}-${idSuffix}`;
        return (
          <div key={section.key} className={styles.section} role="group" aria-labelledby={labelId}>
            <p id={labelId} className={styles.sectionLabel}>
              {t(`groups.${section.key}`)}
            </p>
            {section.modules.map((mod) => {
              const Icon = mod.icon;
              const count = moduleQueueCount(mod, summary);
              const label = t(mod.labelKey);
              const waiting = count ? t("waiting", { count: formatCount(count) }) : null;
              return (
                <Link
                  key={mod.key}
                  href={href(mod.href)}
                  onClick={onNavigate}
                  aria-current={match?.module.key === mod.key ? "page" : undefined}
                  className={styles.link}
                  title={collapsed ? (waiting ? `${label} · ${waiting}` : label) : undefined}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span className={styles.linkLabel}>{label}</span>
                  {count ? (
                    <span className={styles.count}>
                      <span aria-hidden="true">{formatCount(count)}</span>
                      <span className="sr-only">{waiting}</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Breadcrumbs({ match, href }: { match: RouteMatch | null; href: (path: string) => string }) {
  const t = useTranslations("admin.shell");
  const crumbs: { label: string; href?: string }[] = [];
  if (match && match.module.key !== "dashboard") {
    crumbs.push({ label: t(`groups.${match.section.key}`) });
    crumbs.push({ label: t(match.module.labelKey), href: href(match.module.href) });
    if (match.tab && match.module.visibleTabs.length > 1) crumbs.push({ label: t(match.tab.labelKey), href: href(match.tab.href) });
    if (match.rest.length) {
      const last = match.rest[match.rest.length - 1]!;
      const named = NAMED_SEGMENTS.has(last);
      if (!named || match.rest.length > 1) crumbs.push({ label: t("crumbs.detail") });
      if (named) crumbs.push({ label: t(`crumbs.${last}`) });
    }
  }
  return (
    <nav aria-label={t("breadcrumbs")} className={styles.crumbs}>
      <ol>
        <li>
          <Link href={href("")} aria-current={crumbs.length === 0 ? "page" : undefined}>
            <House size={16} aria-hidden="true" />
            <span>{crumbs.length === 0 ? t("nav.dashboard") : t("home")}</span>
          </Link>
        </li>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              <span className={styles.crumbSep} aria-hidden="true">
                <ChevronRight size={14} />
              </span>
              {crumb.href && !last ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current={last ? "page" : undefined}>{crumb.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ModuleTabs({
  mod,
  activeHref,
  summary,
  href,
  formatCount,
}: {
  mod: VisibleModule;
  activeHref?: string;
  summary: Summary;
  href: (path: string) => string;
  formatCount: (value: number) => string;
}) {
  const t = useTranslations("admin.shell");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeHref]);
  return (
    <nav className="erp-tabs" aria-label={t("sectionTabs", { module: t(mod.labelKey) })}>
      <div ref={list} className="erp-tabs__list">
        {mod.visibleTabs.map((tab) => {
          const count = tab.queue ? summary?.[tab.queue] : null;
          return (
            <Link key={tab.href} href={href(tab.href)} aria-current={activeHref === tab.href ? "page" : undefined} className="erp-tabs__tab">
              {t(tab.labelKey)}
              {typeof count === "number" && count > 0 ? (
                <span className="erp-tabs__count">
                  <span aria-hidden="true">{formatCount(count)}</span>
                  <span className="sr-only">{t("waiting", { count: formatCount(count) })}</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function UserMenu({ name, role, compact, placement }: { name: string; role: string; compact: boolean; placement: "up" | "down" }) {
  const t = useTranslations("admin.shell");
  const locale = useLocale();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const initials = name.trim().slice(0, 1).toLocaleUpperCase(locale) || "A";
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className={styles.userMenu} data-placement={placement}>
      <button
        type="button"
        className={compact ? styles.userButtonCompact : styles.userButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account.open", { name })}
        title={compact ? `${name} · ${role}` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials}
        </span>
        {!compact ? (
          <>
            <span className={styles.user}>
              <span>{name}</span>
              <small>{role}</small>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </>
        ) : null}
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label={t("account.title")}>
          <div className={styles.menuHead}>
            <b>{name}</b>
            <small>{role}</small>
          </div>
          <Link role="menuitem" href={`/${locale}/account`} className={styles.menuItem} onClick={() => setOpen(false)}>
            <UserRound size={16} aria-hidden="true" />
            {t("account.profile")}
          </Link>
          <Link role="menuitem" href={`/${locale}`} className={styles.menuItem} onClick={() => setOpen(false)}>
            <ExternalLink size={16} aria-hidden="true" />
            {t("account.viewSite")}
          </Link>
          <button
            role="menuitem"
            type="button"
            className={styles.menuItem}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              resetQueues();
              void signOut();
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {busy ? t("account.signingOut") : t("account.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type PaletteItem = { key: string; href: string; label: string; group: string; hint?: string; icon?: typeof Search };

/**
 * Ctrl/⌘+K: jump to any page or tab the admin may open, run a common action, or find a person, order or
 * support case as they type (the operational search the dashboard used to carry). Arrow keys move, Enter
 * opens, Esc closes.
 */
function CommandPalette({ sections, permissions, onClose }: { sections: VisibleSection[]; permissions: ReadonlySet<string>; onClose: () => void }) {
  const t = useTranslations("admin.shell");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<AdminSearchResultDto | null>(null);
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => input.current?.focus(), []);
  const q = query.trim();
  const canSearch = ["customer.view", "commerce.view", "support.view"].some((p) => permissions.has(p));

  useEffect(() => {
    setResults(null);
    const id = ++generation.current;
    if (q.length < 2 || !canSearch) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      Promise.resolve()
        .then(() => adminService.search(q))
        .then((value) => {
          if (id === generation.current) setResults(value);
        })
        .catch(() => undefined)
        .finally(() => {
          if (id === generation.current) setSearching(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, canSearch]);

  const pages = useMemo<PaletteItem[]>(
    () =>
      sections.flatMap((section) =>
        section.modules.flatMap((mod) => {
          const group = t(`groups.${section.key}`);
          const own: PaletteItem = { key: `m:${mod.key}`, href: mod.href, label: t(mod.labelKey), group, icon: mod.icon };
          const tabs = mod.visibleTabs
            .filter((tab) => tab.href !== mod.href)
            .map((tab): PaletteItem => ({ key: `t:${tab.href}`, href: tab.href, label: t(tab.labelKey), hint: t(mod.labelKey), group, icon: mod.icon }));
          return [own, ...tabs];
        }),
      ),
    [sections, t],
  );
  const actions = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];
    const group = t("palette.actions");
    if (permissions.has("content.create")) list.push({ key: "a:article", href: "/content/new", label: t("palette.newArticle"), group, icon: Plus });
    if (permissions.has("support.manage")) list.push({ key: "a:case", href: "/support", label: t("palette.newCase"), group, icon: Headset });
    if (permissions.has("customer.view")) list.push({ key: "a:new-users", href: "/users?segment=NEW", label: t("palette.newUsers"), group, icon: UserRound });
    return list;
  }, [permissions, t]);

  const matches = useMemo<PaletteItem[]>(() => {
    const needle = q.toLocaleLowerCase(locale);
    const hit = (item: PaletteItem) => !needle || [item.label, item.group, item.hint ?? ""].some((text) => text.toLocaleLowerCase(locale).includes(needle));
    const found = [...actions.filter(hit), ...pages.filter(hit)];
    if (!q) return found;
    const live: PaletteItem[] = [];
    if (results) {
      for (const c of results.customers.slice(0, 5))
        live.push({ key: `c:${c.id}`, href: `/customers/${c.id}`, label: c.displayName, hint: c.emailMasked ?? c.phoneMasked ?? undefined, group: t("palette.people"), icon: UserRound });
      for (const o of results.orders.slice(0, 5))
        live.push({ key: `o:${o.id}`, href: `/commerce/orders/${o.id}`, label: t("palette.order", { reference: o.id.slice(-8) }), group: t("palette.orders"), icon: ShoppingBag });
      for (const s of results.supportCases.slice(0, 5))
        live.push({ key: `s:${s.id}`, href: `/support/${s.id}`, label: s.subject, group: t("palette.supportCases"), icon: FileText });
    }
    const people: PaletteItem[] = permissions.has("customer.view")
      ? [{ key: "p:users", href: `/users?q=${encodeURIComponent(q)}`, label: t("palette.searchPeople", { query: q }), group: t("nav.users"), icon: Search }]
      : [];
    return [...live, ...found, ...people];
  }, [actions, pages, results, q, locale, t, permissions]);

  useEffect(() => setIndex((i) => Math.min(i, Math.max(0, matches.length - 1))), [matches.length]);
  const open = (path: string) => {
    onClose();
    router.push(`/${locale}/admin${path}`);
  };

  return (
    <div className="gx-palette" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gx-palette__box" role="dialog" aria-modal="true" aria-label={t("palette.title")}>
        <div className="gx-palette__input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={input}
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-palette-list"
            aria-activedescendant={matches[index] ? `admin-palette-${index}` : undefined}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && matches[index]) {
                e.preventDefault();
                open(matches[index].href);
              }
            }}
          />
          {searching ? <span className="gx-palette__status">{t("palette.searching")}</span> : null}
          <kbd className="gx-palette__esc">Esc</kbd>
        </div>
        <ul id="admin-palette-list" role="listbox" aria-label={t("palette.title")}>
          {matches.length === 0 ? (
            <li className="gx-empty">{t("palette.empty")}</li>
          ) : (
            matches.map((item, i) => {
              const Icon = item.icon;
              const heading = i === 0 || matches[i - 1]!.group !== item.group ? item.group : null;
              return (
                <Fragment key={item.key}>
                  {heading ? (
                    <li role="presentation" className="gx-palette__group">
                      {heading}
                    </li>
                  ) : null}
                  <li role="presentation">
                    <a
                      id={`admin-palette-${i}`}
                      role="option"
                      aria-selected={i === index}
                      href={`/${locale}/admin${item.href}`}
                      onMouseEnter={() => setIndex(i)}
                      onClick={(e) => {
                        e.preventDefault();
                        open(item.href);
                      }}
                    >
                      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
                      <span>{item.label}</span>
                      {item.hint ? <small>{item.hint}</small> : null}
                    </a>
                  </li>
                </Fragment>
              );
            })
          )}
        </ul>
        <p className="gx-palette__foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("palette.move")}
          </span>
          <span>
            <kbd>↵</kbd> {t("palette.open")}
          </span>
        </p>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("admin.shell");
  const items = [
    ...ADMIN_SECTIONS.flatMap((section) =>
      section.modules.flatMap((mod) =>
        mod.tabs
          ? mod.tabs.map((tab) => ({ href: tab.href, label: `${t(mod.labelKey)} · ${t(tab.labelKey)}` }))
          : [{ href: mod.href, label: t(mod.labelKey) }],
      ),
    ),
    ...PREVIEW_ONLY.map((item) => ({ href: item.href, label: t(item.labelKey) })),
  ];
  return (
    <LocalPreviewGate title="admin" items={items.map((item) => ({ href: `/${locale}/admin${item.href}`, label: item.label }))} live={<LiveAdminShell>{children}</LiveAdminShell>}>
      {children}
    </LocalPreviewGate>
  );
}
