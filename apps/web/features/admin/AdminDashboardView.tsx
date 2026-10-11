"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ErrorRecovery, Skeleton } from "@petlife/ui";
import type { AdminDashboardSummaryDto, AdminTaskDto } from "@petlife/types";
import Link from "@/features/navigation/localized-link";
import { adminService, type SystemHealth, type TrustQueueItem, type TrustQueueSummary } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";

type Locale = "fa" | "en";
const num = (n: number, l: Locale) => n.toLocaleString(l === "fa" ? "fa-IR" : "en-US");
const SEV: Record<string, { fa: string; en: string; tone: string }> = {
  CRITICAL: { fa: "بحرانی", en: "Critical", tone: "critical" }, HIGH: { fa: "بالا", en: "High", tone: "high" },
  MEDIUM: { fa: "متوسط", en: "Medium", tone: "medium" }, LOW: { fa: "کم", en: "Low", tone: "low" },
};
const KIND: Record<string, { fa: string; en: string }> = {
  REPORT: { fa: "گزارش کاربر", en: "User report" }, PLACE_REPORT: { fa: "گزارش مکان", en: "Place report" },
  TRUST_CASE: { fa: "پرونده‌ی اعتماد", en: "Trust case" }, APPEAL: { fa: "اعتراض", en: "Appeal" },
};
const queueHref = (i: TrustQueueItem) => (i.kind === "TRUST_CASE" && i.trustCaseId ? `/admin/trust/${i.trustCaseId}` : i.kind === "REPORT" ? "/admin/community" : i.kind === "PLACE_REPORT" ? "/admin/places" : "/admin/trust");

/** Deterministic pseudo-random in [0,1) — stable dot layout between renders. */
const rnd = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };

/**
 * Orbit: every open item is a dot. Inner ring = Trust & Safety queue (coloured by severity), middle = support
 * cases, outer = admin tasks (overdue ones lit). Counts are real; positions are only layout.
 */
function Orbit({ queue, support, tasks, locale }: { queue: TrustQueueItem[]; support: number; tasks: AdminTaskDto[]; locale: Locale }) {
  const fa = locale === "fa";
  const now = Date.now();
  const rings = [
    { r: 92, label: fa ? "اعتماد و امنیت" : "TRUST & SAFETY", dots: queue.map((q) => SEV[q.severity]?.tone ?? "low") },
    { r: 162, label: fa ? "پشتیبانی" : "SUPPORT", dots: Array.from({ length: support }, () => "violet") },
    { r: 232, label: fa ? "وظایف" : "TASKS", dots: tasks.map((t) => (t.dueAt && Date.parse(t.dueAt) < now ? "high" : "muted")) },
  ];
  const total = queue.length + support + tasks.length;
  return (
    <svg viewBox="-270 -270 540 540" className="erp-orbit" role="img" aria-label={fa ? `${total} مورد باز` : `${total} open items`}>
      {rings.map((ring, k) => (
        <g key={k}>
          <circle r={ring.r} className="erp-orbit__ring" />
          {Array.from({ length: Math.round(ring.r / 2.6) }, (_, i) => {
            const a = (i / Math.round(ring.r / 2.6)) * Math.PI * 2 + rnd(i, k) * 0.2, rr = ring.r + (rnd(i, k + 9) - 0.5) * 36;
            return <circle key={`f${i}`} cx={Math.cos(a) * rr} cy={Math.sin(a) * rr} r={2.3} className="erp-orbit__dust" />;
          })}
          {ring.dots.map((tone, i) => {
            const a = -Math.PI / 2 + 0.35 + (i / Math.max(1, ring.dots.length)) * (Math.PI * 2 - 0.7) + rnd(i, k + 3) * 0.2, rr = ring.r + (rnd(i, k + 5) - 0.5) * 26;
            return <circle key={i} cx={Math.cos(a) * rr} cy={Math.sin(a) * rr} r={tone === "muted" ? 4.4 : 6.5} className={`erp-orbit__dot erp-orbit__dot--${tone}`} />;
          })}
        </g>
      ))}
      {rings.map((ring, k) => (
        <g key={`l${k}`} transform={`translate(0 ${-ring.r})`}>
          <rect x={-ring.label.length * 4.2 - 10} y="-10" width={ring.label.length * 8.4 + 20} height="20" rx="10" className="erp-orbit__tag" />
          <text y="4" textAnchor="middle" className="erp-orbit__label">{ring.label}</text>
        </g>
      ))}
      <circle r="46" className="erp-orbit__core" />
      <text y="2" textAnchor="middle" className="erp-orbit__num">{num(total, locale)}</text>
      <text y="24" textAnchor="middle" className="erp-orbit__sub">{fa ? "مورد باز" : "open items"}</text>
    </svg>
  );
}

export function AdminDashboardView() {
  const locale: Locale = useLocale() === "en" ? "en" : "fa";
  const fa = locale === "fa";
  const tReason = useTranslations("community.reportReason");
  // Report reasons arrive as codes (SCAM, SPAM…); case reasons are free text — label codes, keep text as is.
  const reason = (r: string) => (/^[A-Z_]+$/.test(r) && tReason.has(r) ? tReason(r) : r);
  const name = useAdminStore((s) => s.context?.displayName) ?? "";
  const [summary, setSummary] = useState<AdminDashboardSummaryDto | null>(null);
  const [queue, setQueue] = useState<TrustQueueItem[] | null>(null);
  const [qs, setQs] = useState<TrustQueueSummary | null>(null);
  const [tasks, setTasks] = useState<AdminTaskDto[] | null>(null);
  const [health, setHealth] = useState<SystemHealth | "na" | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const [s, q, qsum, t] = await Promise.all([
        adminService.getDashboard(),
        adminService.getTrustQueue(30).catch(() => ({ items: [] as TrustQueueItem[] })),
        adminService.getTrustQueueSummary().catch(() => null),
        adminService.listTasks({ status: "OPEN" as never, pageSize: 50 }).catch(() => ({ items: [] as AdminTaskDto[] })),
      ]);
      setSummary(s); setQueue(q.items); setQs(qsum); setTasks(t.items);
    } catch {
      setError(true);
    }
    // Health is permission-gated; its absence never blanks the home.
    adminService.getSystemHealth().then(setHealth).catch(() => setHealth("na"));
  }
  useEffect(() => { void load(); }, []);

  if (error) return <ErrorRecovery title={fa ? "داشبورد بارگذاری نشد" : "Dashboard failed to load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!summary || !queue || !tasks) return <Skeleton className="h-96 w-full" aria-label={fa ? "در حال بارگذاری" : "Loading"} />;

  const hour = new Date().getHours();
  const greet = fa ? (hour < 12 ? "صبح بخیر" : hour < 17 ? "روز بخیر" : "عصر بخیر") : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const now = Date.now();
  const due = tasks.filter((t) => t.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  const overdue = due.filter((t) => Date.parse(t.dueAt!) < now).length;
  const time = new Intl.DateTimeFormat(fa ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  const breached = qs?.slaBreached ?? queue.filter((q) => q.slaBreached).length;
  const workers = health && health !== "na" ? health.components.workers ?? [] : [];
  const comps = health && health !== "na" ? (["api", "database", "redis", "storage", "outbox"] as const).map((k) => [k, (health.components[k] as { status?: string } | undefined)?.status ?? "—"] as const) : [];
  const compLabel: Record<string, [string, string]> = { api: ["API", "API"], database: ["پایگاه داده", "Database"], redis: ["Redis", "Redis"], storage: ["ذخیره‌سازی فایل", "File storage"], outbox: ["صف رویدادها", "Event outbox"] };
  const fmtDay = (iso: string) => new Intl.DateTimeFormat(fa ? "fa-IR" : "en-GB", { day: "numeric", month: "short" }).format(new Date(iso));

  return (
    <div className="erp-home">
      <h1 className="erp-greet">{greet}{name ? (fa ? `، ${name}` : `, ${name}`) : ""}</h1>

      <div className="erp-top">
        <section className="erp-hero" aria-labelledby="erp-hero-title">
          <div className="erp-hero__copy">
            <p className="erp-kicker">{fa ? `امروز · ساعت ${time}` : `TODAY · ${time}`}</p>
            <h2 id="erp-hero-title" className="erp-hero__title">
              {fa ? <>{num(queue.length, locale)} مورد اعتماد و امنیت<br />منتظر تصمیم شماست</> : <>{queue.length} trust &amp; safety items<br />need your decision</>}
            </h2>
            <p className="erp-hero__text">
              {fa
                ? `${num(breached, locale)} مورد از مهلت پاسخ گذشته${qs ? ` و ${num(qs.unassigned, locale)} مورد بی‌مسئول است` : ""}. از موردهای با شدت بالا شروع کنید.`
                : `${breached} past their response window${qs ? `, ${qs.unassigned} unassigned` : ""}. Start with high severity.`}
            </p>
            <span className="erp-chip">{fa ? "این هفته" : "THIS WEEK"}</span>
            <dl className="erp-hero__stats">
              <div><dd>{num(summary.openSupportCases, locale)}</dd><dt>{fa ? "پشتیبانی باز" : "open support"}</dt></div>
              <div><dd>{num(summary.openTasks, locale)}</dd><dt>{fa ? "وظیفه‌ی باز" : "open tasks"}</dt></div>
              <div><dd>{num(summary.pendingRefundApprovals, locale)}</dd><dt>{fa ? "بازپرداخت در انتظار" : "refunds pending"}</dt></div>
            </dl>
          </div>
          <Orbit queue={queue} support={summary.openSupportCases} tasks={tasks} locale={locale} />
        </section>

        <section className="erp-card erp-waiting" aria-labelledby="erp-waiting">
          <h2 id="erp-waiting" className="erp-card__title erp-card__title--lg">{fa ? "در انتظار شما" : "Waiting for you"}</h2>
          <p className="erp-card__sub">{fa ? `${num(overdue, locale)} از ${num(due.length, locale)} وظیفه‌ی زمان‌دار از موعد گذشته است` : `${overdue} of ${due.length} dated tasks are overdue`}</p>
          {due[0] ? (
            <div className="erp-focus">
              <p className="erp-kicker erp-kicker--dark">{Date.parse(due[0].dueAt!) < now ? (fa ? "از موعد گذشته" : "OVERDUE") : (fa ? `موعد · ${fmtDay(due[0].dueAt!)}` : `DUE · ${fmtDay(due[0].dueAt!)}`)}</p>
              <p className="erp-focus__title">{due[0].title}</p>
              {due[0].description ? <p className="erp-focus__meta">{due[0].description}</p> : null}
              <Link href="/admin/tasks" className="erp-btn-dark">{fa ? "رسیدگی در وظایف" : "Open in tasks"}</Link>
            </div>
          ) : <p className="erp-card__sub">{fa ? "وظیفه‌ی زمان‌داری باز نیست." : "No dated task is open."}</p>}
          <ul className="erp-list">
            {due.slice(1, 4).map((t) => (
              <li key={t.id}><Link href="/admin/tasks" className="erp-list__row"><span className="erp-signal" aria-hidden="true" /><span className="erp-list__text"><b>{t.title}</b><small>{fmtDay(t.dueAt!)}</small></span></Link></li>
            ))}
          </ul>
        </section>
      </div>

      <div className="erp-grid">
        <section className="erp-card" aria-labelledby="erp-queue">
          <div className="erp-card__head"><h2 id="erp-queue" className="erp-card__title">{fa ? "صف اعتماد و امنیت" : "Trust & Safety queue"}</h2><Link href="/admin/trust" className="erp-link">{fa ? "همه" : "All"}</Link></div>
          <p className="erp-card__sub">{fa ? "به ترتیب: مهلت گذشته، شدت، قدیمی‌ترین" : "Ordered by breached, severity, oldest"}</p>
          <ul className="erp-list">
            {queue.slice(0, 6).map((q) => (
              <li key={q.key}>
                <Link href={queueHref(q)} className="erp-list__row">
                  <span className="erp-list__text"><b>{KIND[q.kind]?.[locale] ?? q.kind}{q.reasons[0] ? ` · ${reason(q.reasons[0])}` : ""}</b><small>{fa ? `${num(q.ageHours, locale)} ساعت پیش` : `${q.ageHours}h ago`}{q.slaBreached ? (fa ? " · مهلت گذشته" : " · SLA breached") : ""}</small></span>
                  <span className={`erp-sev erp-sev--${SEV[q.severity]?.tone ?? "low"}`}>{SEV[q.severity]?.[locale] ?? q.severity}</span>
                </Link>
              </li>
            ))}
            {queue.length === 0 ? <li className="erp-card__sub">{fa ? "صف خالی است." : "The queue is empty."}</li> : null}
          </ul>
        </section>

        <section className="erp-card" aria-labelledby="erp-health">
          <div className="erp-card__head"><h2 id="erp-health" className="erp-card__title">{fa ? "سلامت سیستم" : "System health"}</h2>{health && health !== "na" ? <span className={`erp-sev erp-sev--${health.status === "HEALTHY" ? "ok" : "high"}`}>{health.status === "HEALTHY" ? (fa ? "سالم" : "Healthy") : health.status}</span> : null}</div>
          <p className="erp-card__sub">{fa ? "اجزای اصلی سرویس، بررسی همین حالا" : "Core services, checked just now"}</p>
          {health === "na" ? <p className="erp-card__sub">{fa ? "دسترسی به سلامت سیستم برای نقش شما فعال نیست." : "System health isn't available to your role."}</p> : !health ? <Skeleton className="h-32 w-full" /> : (
            <ul className="erp-list">
              {comps.map(([k, st]) => (
                <li key={k} className="erp-list__row erp-list__row--static"><span className="erp-list__text"><b>{compLabel[k]![fa ? 0 : 1]}</b></span><span className={`erp-dotlabel erp-dotlabel--${st === "UP" || st === "OK" ? "ok" : "high"}`}>{st === "UP" || st === "OK" ? (fa ? "فعال" : "Up") : st}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="erp-card" aria-labelledby="erp-workers">
          <h2 id="erp-workers" className="erp-card__title">{fa ? "کارهای پس‌زمینه" : "Background jobs"}</h2>
          <p className="erp-card__sub">{fa ? `${num(workers.filter((w) => w.status === "OK").length, locale)} از ${num(workers.length, locale)} در وضعیت عادی` : `${workers.filter((w) => w.status === "OK").length} of ${workers.length} healthy`}</p>
          <ul className="erp-list">
            {workers.slice(0, 7).map((w) => (
              <li key={w.name} className="erp-list__row erp-list__row--static">
                <span className="erp-list__text"><b dir="ltr">{w.name}</b><small>{fa ? `هر ${num(Math.round(w.intervalMs / 1000), locale)} ثانیه` : `every ${Math.round(w.intervalMs / 1000)}s`}</small></span>
                <span className={`erp-dotlabel erp-dotlabel--${w.status === "OK" ? "ok" : w.status === "WAITING_FIRST_RUN" ? "muted" : "high"}`}>{w.status === "OK" ? (fa ? "عادی" : "OK") : w.status === "WAITING_FIRST_RUN" ? (fa ? "منتظر اولین اجرا" : "Waiting first run") : w.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
