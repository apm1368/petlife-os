"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, ClipboardList, ContextSurface, ErrorRecovery, HeartPulse, LifeBuoy as MessageCircle, ShieldCheck, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminDashboardSummaryDto, AdminTaskDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import Link from "@/features/navigation/localized-link";
import { AdminOperationalSearch } from "./AdminOperationalSearch";
import { adminService, type SystemHealth, type TrustQueueItem } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import { formatCount } from "@/lib/number/format-number";
import type { RouteLocale } from "@/lib/i18n/config";
import "./approved-admin.css";
import { DashboardInsights } from "./reports/DashboardInsights";

type LoadFailure = "failed" | "offline" | "noAccess";
type Result<T> = { value: T | null; failure: LoadFailure | null };
const initial: Result<never> = { value: null, failure: null };

function failureKind(error: unknown): LoadFailure {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return "noAccess";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  return "failed";
}

/** Operational dashboard: real counts and permission-gated queues, no invented sales chart. */
export function AdminDashboardView() {
  const t = useTranslations("rollout.admin");
  const locale = useLocale() as RouteLocale;
  const context = useAdminStore((s) => s.context);
  const permissions = (context?.permissions ?? []).join(",");
  const allowed = (permission: string) => permissions.split(",").includes(permission);
  const [summary, setSummary] = useState<AdminDashboardSummaryDto | null>(null);
  const [failed, setFailed] = useState<LoadFailure | null>(null);
  const [retry, setRetry] = useState(0);
  const [queue, setQueue] = useState<Result<TrustQueueItem[]>>(initial);
  const [tasks, setTasks] = useState<Result<AdminTaskDto[]>>(initial);
  const [health, setHealth] = useState<Result<SystemHealth>>(initial);

  useEffect(() => {
    let cancelled = false;
    setFailed(null); setSummary(null); setQueue(initial); setTasks(initial); setHealth(initial);
    void adminService.getDashboard().then((value) => { if (!cancelled) setSummary(value); }).catch((error: unknown) => { if (!cancelled) setFailed(failureKind(error)); });
    const has = (p: string) => permissions.split(",").includes(p);
    if (has("trust.view")) void adminService.getTrustQueue(8).then((r) => { if (!cancelled) setQueue({ value: r.items, failure: null }); }).catch((error: unknown) => { if (!cancelled) setQueue({ value: null, failure: failureKind(error) }); });
    if (has("task.manage")) void adminService.listTasks({ status: "OPEN" as never, pageSize: 8 }).then((r) => { if (!cancelled) setTasks({ value: r.items, failure: null }); }).catch((error: unknown) => { if (!cancelled) setTasks({ value: null, failure: failureKind(error) }); });
    if (has("system.view")) void adminService.getSystemHealth().then((value) => { if (!cancelled) setHealth({ value, failure: null }); }).catch((error: unknown) => { if (!cancelled) setHealth({ value: null, failure: failureKind(error) }); });
    return () => { cancelled = true; };
  }, [permissions, retry]);

  const reload = () => setRetry((n) => n + 1);
  if (failed === "noAccess") return <div role="alert"><ContextSurface aria-labelledby="admin-dashboard-title"><h1 id="admin-dashboard-title">{t("title")}</h1><p>{t("noAccess")}</p></ContextSurface></div>;
  if (failed) return <ErrorRecovery title={t("title")} message={t(failed)} retryLabel={t("retry")} onRetry={reload} />;
  if (!summary) return <Skeleton className="h-96 w-full" aria-label={t("loading")} />;
  const stats = [
    { key: "support", value: summary.openSupportCases, href: "/admin/support", permission: "support.view", Icon: MessageCircle },
    { key: "tasks", value: summary.openTasks, href: "/admin/tasks", permission: "task.manage", Icon: ClipboardList },
    { key: "trust", value: summary.openTrustCases, href: "/admin/trust", permission: "trust.view", Icon: ShieldCheck },
    { key: "disputes", value: summary.openDisputes, href: "/admin/disputes", permission: "dispute.view", Icon: BadgeCheck },
    { key: "refunds", value: summary.pendingRefundApprovals, href: "/admin/transactions", permission: "finance.view", Icon: HeartPulse },
  ];
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(iso));
  const renderFailure = (kind: LoadFailure | null) => <div role="alert" className="approved-admin__failure"><p>{t(kind ?? "failed")}</p><button type="button" onClick={reload}>{t("retry")}</button></div>;
  const statusLabel = (status: string) => {
    const known: Record<string, string> = {
      HEALTHY: t("systemStatus.HEALTHY"), DEGRADED: t("systemStatus.DEGRADED"),
      LAGGING: t("systemStatus.LAGGING"), DOWN: t("systemStatus.DOWN"),
      UP: t("systemStatus.UP"), RUNNING: t("systemStatus.RUNNING"),
      ERROR: t("systemStatus.ERROR"), NOT_PROVIDED: t("notProvided"),
    };
    return known[status] ?? status;
  };
  return <div className="approved-admin">
    <header className="approved-admin__heading"><div><p>{context?.displayName}</p><h1>{t("title")}</h1><p>{t("subtitle")}</p></div><time dateTime={new Date().toISOString()}>{date(new Date().toISOString())}</time></header>
    <AdminOperationalSearch />
    {allowed("analytics.view") ? <DashboardInsights /> : null}
    {allowed("verification.manage") && <Link href="/admin/verification" className="underline">{t("verificationQueue")}</Link>}
    {allowed("access.view") && <Link href="/admin/access" className="underline">{t("accessControl")}</Link>}
    {allowed("travel.source.view") && <Link href="/admin/travel/external" className="underline">{t("externalSources")}</Link>}
    {allowed("insurance.view") && <Link href="/admin/insurance/providers" className="underline">{t("insuranceProviders")}</Link>}
    {allowed("sellerFinance.view") && <Link href="/admin/marketplace-statements" className="underline">{t("marketplaceStatements")}</Link>}
    <div className="approved-admin__stats">{stats.map(({ key, value, href, permission, Icon }) => {
      if (!allowed(permission) || value === null) return null;
      const content = <><span><Icon size={20} aria-hidden="true" />{t(key)}</span><strong>{formatCount(value, locale)}</strong></>;
      return <Link key={key} href={href} className="approved-admin__stat">{content}</Link>;
    })}</div>
    <div className="approved-admin__grid">
      {allowed("trust.view") ? <section className="approved-admin__panel"><header><h2>{t("queue")}</h2><Link href="/admin/trust">{t("all")}</Link></header>
        {queue.failure ? renderFailure(queue.failure) : !queue.value ? <Skeleton className="h-48 w-full" aria-label={t("loading")} /> : queue.value.length === 0 ? <p>{t("empty")}</p> : <ul>{queue.value.map((item) => <li key={item.key}><Link href={item.trustCaseId ? `/admin/trust/${item.trustCaseId}` : "/admin/trust"}><span><b>{t(`kind.${item.kind}`)}</b>{item.reasons[0] ? <small>{item.reasons[0]}</small> : null}</span><StatusLabel tone={item.severity === "CRITICAL" ? "urgent" : item.severity === "HIGH" ? "attention" : "neutral"}>{t(`severity.${item.severity}`)}</StatusLabel></Link></li>)}</ul>}
      </section> : null}
      {allowed("task.manage") ? <section className="approved-admin__panel"><header><h2>{t("taskList")}</h2><Link href="/admin/tasks">{t("all")}</Link></header>
        {tasks.failure ? renderFailure(tasks.failure) : !tasks.value ? <Skeleton className="h-48 w-full" aria-label={t("loading")} /> : tasks.value.length === 0 ? <p>{t("empty")}</p> : <ul>{tasks.value.map((item) => <li key={item.id}><Link href="/admin/tasks"><span><b>{item.title}</b>{item.dueAt ? <small>{t("due", { date: date(item.dueAt) })}</small> : null}</span></Link></li>)}</ul>}
      </section> : null}
      {allowed("system.view") ? <section className="approved-admin__panel approved-admin__system"><header><h2>{t("system")}</h2></header>
        {health.failure ? renderFailure(health.failure) : !health.value ? <Skeleton className="h-48 w-full" aria-label={t("loading")} /> : <><StatusLabel tone={health.value.status === "HEALTHY" ? "success" : "attention"}>{statusLabel(health.value.status)}</StatusLabel><dl>{["api", "database", "redis", "storage", "outbox"].map((key) => <div key={key}><dt>{t(`component.${key}`)}</dt><dd><bdi dir="ltr">{statusLabel(String((health.value?.components[key] as { status?: string } | undefined)?.status ?? "NOT_PROVIDED"))}</bdi></dd></div>)}</dl><h3>{t("workers")}</h3><ul>{health.value.components.workers?.map((worker) => <li key={worker.name}><span><bdi dir="ltr">{worker.name}</bdi></span><bdi dir="ltr">{statusLabel(worker.status)}</bdi></li>)}</ul></>}
      </section> : null}
    </div>
  </div>;
}
