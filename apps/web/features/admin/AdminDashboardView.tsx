"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  BadgeCheck,
  ChartColumn,
  CircleCheck,
  ClipboardList,
  ContextSurface,
  ErrorRecovery,
  Gauge,
  Gavel,
  Globe,
  Headset,
  Heart,
  HeartHandshake,
  Hotel,
  KeyRound,
  Landmark,
  MapPinned,
  MessagesSquare,
  PackageCheck,
  Plus,
  Receipt,
  Search,
  ShieldAlert,
  ShieldPlus,
  ShoppingBag,
  Siren,
  Skeleton,
  SlidersHorizontal,
  StatusLabel,
  Wallet,
} from "@petlife/ui";
import type { AdminTaskDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import Link from "@/features/navigation/localized-link";
import { adminService, type SystemHealth, type TrustQueueItem } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import { formatCount } from "@/lib/number/format-number";
import type { RouteLocale } from "@/lib/i18n/config";
import { DashboardInsights } from "./reports/DashboardInsights";
import { refreshQueues, useQueues } from "./admin-queues";
import type { QueueKey } from "./admin-nav";

type LoadFailure = "failed" | "offline" | "noAccess";
type Result<T> = { value: T | null; failure: LoadFailure | null };
const initial: Result<never> = { value: null, failure: null };
type Icon = typeof Gauge;

function failureKind(error: unknown): LoadFailure {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return "noAccess";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  return "failed";
}

/**
 * Every queue that waits on staff, most consequential first: safety and money before moderation backlogs.
 * Each is gated by the permission of the list it opens — the API already withholds the count (null), and the
 * page never draws a tile it would not let the admin open.
 */
const QUEUES: { key: QueueKey; href: string; permission: string; icon: Icon; tone: "urgent" | "attention" | "neutral" }[] = [
  { key: "openTrustCases", href: "/admin/trust", permission: "trust.view", icon: ShieldAlert, tone: "urgent" },
  { key: "openDisputes", href: "/admin/disputes", permission: "dispute.view", icon: Gavel, tone: "urgent" },
  { key: "openSupportCases", href: "/admin/support", permission: "support.view", icon: Headset, tone: "attention" },
  { key: "pendingRefundApprovals", href: "/admin/transactions", permission: "finance.view", icon: ArrowLeftRight, tone: "attention" },
  { key: "pendingRefundRequests", href: "/admin/commerce/refund-requests", permission: "commerce.view", icon: Receipt, tone: "attention" },
  { key: "pendingWalletTopUps", href: "/admin/wallets/top-ups", permission: "wallet.view", icon: Wallet, tone: "attention" },
  { key: "pendingDeletionRequests", href: "/admin/privacy/deletion-requests", permission: "admin.manage", icon: KeyRound, tone: "attention" },
  { key: "openOwnershipDisputes", href: "/admin/ownership-transfers", permission: "customer.view", icon: Gavel, tone: "attention" },
  { key: "openCommunityReports", href: "/admin/community", permission: "trust.view", icon: Siren, tone: "attention" },
  { key: "pendingVerifications", href: "/admin/verification", permission: "verification.manage", icon: BadgeCheck, tone: "neutral" },
  { key: "pendingOfferModeration", href: "/admin/commerce/product-moderation", permission: "commerce.view", icon: ShoppingBag, tone: "neutral" },
  { key: "pendingCatalogRequests", href: "/admin/commerce/catalog-product-requests", permission: "commerce.view", icon: PackageCheck, tone: "neutral" },
  { key: "pendingTravelListings", href: "/admin/travel", permission: "travel.view", icon: Hotel, tone: "neutral" },
  { key: "pendingSupportNeeds", href: "/admin/animal-support/needs", permission: "trust.view", icon: HeartHandshake, tone: "neutral" },
  { key: "pendingMemorials", href: "/admin/pet-memorials", permission: "trust.view", icon: Heart, tone: "neutral" },
  { key: "openPlaceReports", href: "/admin/places", permission: "places.view", icon: MapPinned, tone: "neutral" },
  { key: "openTasks", href: "/admin/tasks", permission: "task.manage", icon: ClipboardList, tone: "neutral" },
];

/** Where admins go most, each behind the permission of the page it opens. Labels come from the shell's nav copy. */
const SHORTCUTS: { href: string; labelKey: string; permission: string; icon: Icon }[] = [
  { href: "/admin/reports", labelKey: "nav.reports", permission: "analytics.view", icon: ChartColumn },
  { href: "/admin/content/new", labelKey: "palette.newArticle", permission: "content.create", icon: Plus },
  { href: "/admin/users", labelKey: "nav.users", permission: "customer.view", icon: Search },
  { href: "/admin/verification", labelKey: "tabs.verification", permission: "verification.manage", icon: BadgeCheck },
  { href: "/admin/site-settings", labelKey: "nav.siteSettings", permission: "settings.view", icon: SlidersHorizontal },
  { href: "/admin/messaging", labelKey: "nav.messaging", permission: "system.view", icon: MessagesSquare },
  { href: "/admin/access", labelKey: "nav.access", permission: "access.view", icon: KeyRound },
  { href: "/admin/travel/external", labelKey: "tabs.externalSources", permission: "travel.source.view", icon: Globe },
  { href: "/admin/insurance/providers", labelKey: "tabs.insuranceProviders", permission: "insurance.view", icon: ShieldPlus },
  { href: "/admin/marketplace-statements", labelKey: "tabs.statements", permission: "sellerFinance.view", icon: Landmark },
  { href: "/admin/status", labelKey: "nav.systemStatus", permission: "support.view", icon: Gauge },
];

function tehranHour(now = new Date()) {
  return new Date(now.getTime() + 3.5 * 3_600_000).getUTCHours();
}

/** The admin landing page: what needs a person now, how the platform is doing, then the work lists and status. */
export function AdminDashboardView() {
  const t = useTranslations("rollout.admin");
  const tShell = useTranslations("admin.shell");
  const locale = useLocale() as RouteLocale;
  const context = useAdminStore((s) => s.context);
  const permissions = (context?.permissions ?? []).join(",");
  const allowed = (permission: string) => permissions.split(",").includes(permission);
  const queues = useQueues();
  const [requested, setRequested] = useState(false);
  const [queue, setQueue] = useState<Result<TrustQueueItem[]>>(initial);
  const [tasks, setTasks] = useState<Result<AdminTaskDto[]>>(initial);
  const [health, setHealth] = useState<Result<SystemHealth>>(initial);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRequested(false);
    setQueue(initial);
    setTasks(initial);
    setHealth(initial);
    void refreshQueues(true).finally(() => {
      if (!cancelled) setRequested(true);
    });
    const has = (p: string) => permissions.split(",").includes(p);
    if (has("trust.view")) void adminService.getTrustQueue(6).then((r) => { if (!cancelled) setQueue({ value: r.items, failure: null }); }).catch((error: unknown) => { if (!cancelled) setQueue({ value: null, failure: failureKind(error) }); });
    if (has("task.manage")) void adminService.listTasks({ status: "OPEN" as never, pageSize: 6 }).then((r) => { if (!cancelled) setTasks({ value: r.items, failure: null }); }).catch((error: unknown) => { if (!cancelled) setTasks({ value: null, failure: failureKind(error) }); });
    if (has("system.view")) void adminService.getSystemHealth().then((value) => { if (!cancelled) setHealth({ value, failure: null }); }).catch((error: unknown) => { if (!cancelled) setHealth({ value: null, failure: failureKind(error) }); });
    return () => {
      cancelled = true;
    };
  }, [permissions, retry]);

  const reload = () => setRetry((n) => n + 1);
  const summary = queues.summary;
  const failed = !summary && requested && queues.error ? failureKind(queues.error) : null;
  if (failed === "noAccess")
    return (
      <div role="alert">
        <ContextSurface aria-labelledby="admin-dashboard-title">
          <h1 id="admin-dashboard-title">{t("title")}</h1>
          <p>{t("noAccess")}</p>
        </ContextSurface>
      </div>
    );
  if (failed) return <ErrorRecovery title={t("title")} message={t(failed)} retryLabel={t("retry")} onRetry={reload} />;
  if (!summary) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;

  const date = (iso: string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
    new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-GB", { ...options, timeZone: "Asia/Tehran" }).format(new Date(iso));
  const renderFailure = (kind: LoadFailure | null) => (
    <div role="alert" className="gx-inline-alert">
      <p>{t(kind ?? "failed")}</p>
      <button type="button" className="gx-btn" onClick={reload}>
        {t("retry")}
      </button>
    </div>
  );
  const statusLabel = (status: string) => {
    const known: Record<string, string> = {
      HEALTHY: t("systemStatus.HEALTHY"), DEGRADED: t("systemStatus.DEGRADED"), LAGGING: t("systemStatus.LAGGING"), DOWN: t("systemStatus.DOWN"),
      UP: t("systemStatus.UP"), RUNNING: t("systemStatus.RUNNING"), ERROR: t("systemStatus.ERROR"), NOT_PROVIDED: t("notProvided"),
    };
    return known[status] ?? status;
  };

  const board = QUEUES.filter((q) => allowed(q.permission) && typeof summary[q.key] === "number").map((q) => ({ ...q, count: summary[q.key] as number }));
  const waiting = board.filter((q) => q.count > 0);
  const clear = board.filter((q) => q.count === 0);
  const total = waiting.reduce((sum, q) => sum + q.count, 0);
  const shortcuts = SHORTCUTS.filter((s) => allowed(s.permission));
  const hour = tehranHour();
  const greeting = t(hour < 12 ? "greeting.morning" : hour < 17 ? "greeting.afternoon" : "greeting.evening");
  const workers = health.value?.components.workers ?? [];
  const healthyWorkers = workers.filter((w) => w.status === "RUNNING" || w.status === "HEALTHY" || w.status === "UP").length;

  return (
    <div className="gx-page gx-dashboard">
      <header className="gx-pagehead">
        <div className="gx-pagehead__text">
          <p className="gx-kicker">
            <span>{greeting}</span>
            {context?.displayName ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{context.displayName}</span>
              </>
            ) : null}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="gx-pagehead__actions">
          <time className="gx-chip gx-chip--static" dateTime={new Date().toISOString()}>
            {date(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long" })}
          </time>
          {allowed("analytics.view") ? (
            <Link href="/admin/reports" className="gx-btn gx-btn--primary">
              <ChartColumn size={16} aria-hidden="true" />
              {tShell("nav.reports")}
            </Link>
          ) : null}
        </div>
      </header>

      {board.length ? (
        <section className="gx-card" aria-labelledby="dash-attention">
          <header>
            <div>
              <h2 id="dash-attention">{t("attention.title")}</h2>
              <p>{waiting.length ? t("attention.total", { count: total, queues: waiting.length }) : t("attention.allClear")}</p>
            </div>
          </header>
          {waiting.length ? (
            <ul className="gx-queues">
              {waiting.map(({ key, href, icon: QueueIcon, tone, count }) => (
                <li key={key}>
                  <Link href={href} className={`gx-queue gx-queue--${tone}`}>
                    <span className="gx-queue__icon">
                      <QueueIcon size={18} aria-hidden="true" />
                    </span>
                    <span className="gx-queue__text">
                      <span className="gx-queue__label">{t(`attention.queue.${key}`)}</span>
                      <span className="gx-queue__count">{formatCount(count, locale)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {clear.length ? (
            <p className="gx-cleared">
              <CircleCheck size={16} aria-hidden="true" />
              <span>{t("attention.clearList", { list: clear.map((q) => t(`attention.queue.${q.key}`)).join(locale === "fa" ? "، " : ", ") })}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {allowed("analytics.view") ? (
        <section aria-labelledby="dash-performance" className="gx-page">
          <div className="gx-section-title">
            <h2 id="dash-performance">{t("performance.title")}</h2>
            <p>{t("performance.hint")}</p>
          </div>
          <DashboardInsights />
        </section>
      ) : null}

      {allowed("trust.view") || allowed("task.manage") || allowed("system.view") || shortcuts.length ? (
        <div className="gx-grid gx-grid--wide">
          <div className="gx-grid">
            {allowed("trust.view") ? (
              <section className="gx-card" aria-labelledby="dash-trust">
                <header>
                  <h2 id="dash-trust">{t("queue")}</h2>
                  <Link href="/admin/trust" className="gx-link">
                    {t("all")}
                  </Link>
                </header>
                {queue.failure ? (
                  renderFailure(queue.failure)
                ) : !queue.value ? (
                  <Skeleton className="h-40 w-full" aria-label={t("loading")} />
                ) : queue.value.length === 0 ? (
                  <p className="gx-empty">{t("empty")}</p>
                ) : (
                  <ul className="gx-list">
                    {queue.value.map((item) => (
                      <li key={item.key}>
                        <Link href={item.trustCaseId ? `/admin/trust/${item.trustCaseId}` : "/admin/trust"}>
                          <span>
                            <b>{t(`kind.${item.kind}`)}</b>
                            {item.reasons[0] ? <small>{item.reasons[0]}</small> : null}
                          </span>
                          <StatusLabel tone={item.severity === "CRITICAL" ? "urgent" : item.severity === "HIGH" ? "attention" : "neutral"}>{t(`severity.${item.severity}`)}</StatusLabel>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
            {allowed("task.manage") ? (
              <section className="gx-card" aria-labelledby="dash-tasks">
                <header>
                  <h2 id="dash-tasks">{t("taskList")}</h2>
                  <Link href="/admin/tasks" className="gx-link">
                    {t("all")}
                  </Link>
                </header>
                {tasks.failure ? (
                  renderFailure(tasks.failure)
                ) : !tasks.value ? (
                  <Skeleton className="h-40 w-full" aria-label={t("loading")} />
                ) : tasks.value.length === 0 ? (
                  <p className="gx-empty">{t("empty")}</p>
                ) : (
                  <ul className="gx-list">
                    {tasks.value.map((item) => (
                      <li key={item.id}>
                        <Link href="/admin/tasks">
                          <span>
                            <b>{item.title}</b>
                            {item.dueAt ? <small>{t("due", { date: date(item.dueAt) })}</small> : null}
                          </span>
                          {item.priority === "URGENT" || item.priority === "HIGH" ? <StatusLabel tone={item.priority === "URGENT" ? "urgent" : "attention"}>{t(`priority.${item.priority}`)}</StatusLabel> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
          <div className="gx-grid">
            {allowed("system.view") ? (
              <section className="gx-card" aria-labelledby="dash-health">
                <header>
                  <h2 id="dash-health">{t("system")}</h2>
                  {allowed("support.view") ? (
                    <Link href="/admin/status" className="gx-link">
                      {t("healthLink")}
                    </Link>
                  ) : null}
                </header>
                {health.failure ? (
                  renderFailure(health.failure)
                ) : !health.value ? (
                  <Skeleton className="h-40 w-full" aria-label={t("loading")} />
                ) : (
                  <div className="gx-health">
                    <StatusLabel tone={health.value.status === "HEALTHY" ? "success" : "attention"}>{statusLabel(health.value.status)}</StatusLabel>
                    <dl>
                      {["api", "database", "redis", "storage", "outbox"].map((key) => {
                        const value = String((health.value?.components[key] as { status?: string } | undefined)?.status ?? "NOT_PROVIDED");
                        const ok = value === "UP" || value === "HEALTHY" || value === "RUNNING";
                        return (
                          <div key={key}>
                            <dt>
                              <i className={ok ? "gx-dot gx-dot--ok" : value === "NOT_PROVIDED" ? "gx-dot" : "gx-dot gx-dot--warn"} aria-hidden="true" />
                              {t(`component.${key}`)}
                            </dt>
                            <dd>{statusLabel(value)}</dd>
                          </div>
                        );
                      })}
                    </dl>
                    {workers.length ? (
                      <p className="gx-muted">{t("workersSummary", { running: formatCount(healthyWorkers, locale), total: formatCount(workers.length, locale) })}</p>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
            {shortcuts.length ? (
              <section className="gx-card" aria-labelledby="dash-shortcuts">
                <header>
                  <h2 id="dash-shortcuts">{t("shortcuts")}</h2>
                </header>
                <ul className="gx-shortcuts">
                  {shortcuts.map(({ href, labelKey, icon: ShortcutIcon }) => (
                    <li key={href}>
                      <Link href={href}>
                        <ShortcutIcon size={17} aria-hidden="true" />
                        <span>{tShell(labelKey)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
