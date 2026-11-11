"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "@/features/navigation/localized-link";
import type { AdminReportGranularity, AdminReportKpiDto, AdminReportOverviewDto } from "@petlife/types";
import { Activity, CalendarDays, ChartColumn, Download, HeartPulse, LifeBuoy, Receipt, Repeat, ShoppingBag, TrendingDown, TrendingUp, UserPlus, Users, Wallet, Hotel, CircleAlert } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { adminReportsService } from "@/services/admin-reports.service";
import { useAdminStore } from "@/stores/admin-store";
import { BarList, ColumnChart, Donut, Sparkline, TrendChart } from "./charts";
import { asLocale, downloadCsv, fmtCompact, fmtDay, fmtNumber, fmtPercent, shiftDays, tehranToday } from "./report-format";

const PRESETS = [7, 30, 90, 365] as const;
type Preset = (typeof PRESETS)[number] | "custom";
type Failure = "forbidden" | "failed" | "invalid";

/** Professional ERP reports: KPIs vs the previous period, trends, mix, funnel, leaders and purchase retention. */
export function AdminReportsView() {
  const t = useTranslations("adminReports");
  const locale = asLocale(useLocale());
  const context = useAdminStore((s) => s.context);
  const allowed = !!context?.permissions.includes("analytics.view");
  const today = tehranToday();
  const [preset, setPreset] = useState<Preset>(30);
  const [from, setFrom] = useState(shiftDays(today, -29));
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState<AdminReportGranularity | "auto">("auto");
  const [data, setData] = useState<AdminReportOverviewDto | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setFailure(null);
    setData(null);
    adminReportsService
      .overview({ from, to, granularity: granularity === "auto" ? undefined : granularity }, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure(error instanceof ApiError && error.status === 403 ? "forbidden" : error instanceof ApiError && error.status === 400 ? "invalid" : "failed");
      });
    return () => controller.abort();
  }, [allowed, from, to, granularity, retry]);

  const choosePreset = (days: (typeof PRESETS)[number]) => {
    setPreset(days);
    setTo(today);
    setFrom(shiftDays(today, -(days - 1)));
  };
  const num = (v: number) => fmtNumber(v, locale);
  const money = (v: number) => t("money", { amount: fmtCompact(v, locale) });
  const label = (key: string) => fmtDay(key, locale, data?.range.granularity === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });

  if (!context) return <div className="gx-skel" style={{ height: 320 }} aria-label={t("loading")} />;
  if (!allowed || failure === "forbidden") return <section className="gx-card" role="alert"><h1>{t("title")}</h1><p className="gx-muted">{t("forbidden")}</p></section>;

  const exportCsv = () => {
    if (!data) return;
    const k = data.kpis;
    downloadCsv(`opetlife-report-${data.range.from}-${data.range.to}.csv`, [
      [t("csv.metric"), t("csv.value"), t("csv.previous"), t("csv.change")],
      ...(Object.keys(k) as (keyof typeof k)[]).map((key) => [t(`kpi.${key}`), k[key].value, k[key].previous, k[key].change === null ? "" : (k[key].change! * 100).toFixed(1) + "%"]),
      [],
      [t("csv.bucket"), t("series.newUsers"), t("series.activeUsers"), t("series.orders"), t("series.gmv"), t("series.serviceBookings"), t("series.travelBookings"), t("series.bookingValue")],
      ...data.series.map((p) => [p.bucket, p.newUsers, p.activeUsers, p.orders, p.gmv, p.serviceBookings, p.travelBookings, p.bookingValue]),
    ]);
  };

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker"><ChartColumn size={16} aria-hidden="true" />{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{data ? t("rangeLine", { from: fmtDay(data.range.from, locale, { dateStyle: "medium" }), to: fmtDay(data.range.to, locale, { dateStyle: "medium" }), prevFrom: fmtDay(data.range.previousFrom, locale, { dateStyle: "medium" }), prevTo: fmtDay(data.range.previousTo, locale, { dateStyle: "medium" }) }) : t("subtitle")}</p>
        </div>
        <div className="gx-toolbar">
          <div className="gx-seg" role="group" aria-label={t("period")}>
            {PRESETS.map((days) => <button key={days} type="button" aria-pressed={preset === days} onClick={() => choosePreset(days)}>{t(`preset.${days}`)}</button>)}
            <button type="button" aria-pressed={preset === "custom"} onClick={() => setPreset("custom")}>{t("preset.custom")}</button>
          </div>
          <button type="button" className="gx-btn" onClick={exportCsv} disabled={!data}><Download size={16} aria-hidden="true" />{t("export")}</button>
        </div>
      </header>

      {preset === "custom" ? (
        <form className="gx-card gx-toolbar" onSubmit={(e) => e.preventDefault()} aria-label={t("customRange")}>
          <label className="gx-field"><span>{t("from")}</span><input type="date" dir="ltr" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label className="gx-field"><span>{t("to")}</span><input type="date" dir="ltr" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
          <label className="gx-field"><span>{t("granularity")}</span>
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as AdminReportGranularity | "auto")}>
              {(["auto", "day", "week", "month"] as const).map((g) => <option key={g} value={g}>{t(`granularities.${g}`)}</option>)}
            </select>
          </label>
          <p className="gx-muted"><CalendarDays size={14} aria-hidden="true" /> {t("calendarNote")}</p>
        </form>
      ) : null}

      {failure ? (
        <div className="gx-card" role="alert"><p>{t(failure)}</p><button type="button" className="gx-btn" onClick={() => setRetry((n) => n + 1)}>{t("retry")}</button></div>
      ) : !data ? (
        <div className="gx-grid gx-grid--kpi" aria-busy="true" aria-label={t("loading")}>{Array.from({ length: 8 }, (_, i) => <div key={i} className="gx-skel" style={{ height: 128 }} />)}</div>
      ) : (
        <ReportBody data={data} num={num} money={money} label={label} />
      )}
    </div>
  );
}

function Delta({ kpi, invert = false }: { kpi: AdminReportKpiDto; invert?: boolean }) {
  const t = useTranslations("adminReports");
  const locale = asLocale(useLocale());
  if (kpi.change === null) return <span className="gx-delta gx-delta--flat">{t("new")}</span>;
  if (Math.abs(kpi.change) < 0.0005) return <span className="gx-delta gx-delta--flat">±0</span>;
  const good = invert ? kpi.change < 0 : kpi.change > 0;
  const Icon = kpi.change > 0 ? TrendingUp : TrendingDown;
  return <span className={`gx-delta ${good ? "gx-delta--up" : "gx-delta--down"}`}><Icon size={12} aria-hidden="true" />{kpi.change > 0 ? "+" : ""}{fmtPercent(kpi.change, locale)}</span>;
}

function ReportBody({ data, num, money, label }: { data: AdminReportOverviewDto; num: (v: number) => string; money: (v: number) => string; label: (k: string) => string }) {
  const t = useTranslations("adminReports");
  const locale = asLocale(useLocale());
  const k = data.kpis;
  const pct = (v: number) => fmtPercent(v, locale);
  const labels = data.series.map((p) => p.bucket);
  const col = (key: keyof AdminReportOverviewDto["series"][number]) => data.series.map((p) => Number(p[key]));
  const kpis: { key: keyof typeof k; Icon: typeof Users; value: string; spark?: number[]; invert?: boolean; accent?: boolean; href?: string }[] = [
    { key: "gmv", Icon: Wallet, value: money(k.gmv.value), spark: col("gmv"), accent: true, href: "/admin/commerce/orders" },
    { key: "orders", Icon: ShoppingBag, value: num(k.orders.value), spark: col("orders"), href: "/admin/commerce/orders" },
    { key: "averageOrderValue", Icon: Receipt, value: money(k.averageOrderValue.value) },
    { key: "bookingValue", Icon: HeartPulse, value: money(k.bookingValue.value), spark: col("bookingValue") },
    { key: "serviceBookings", Icon: Activity, value: num(k.serviceBookings.value), spark: col("serviceBookings"), href: "/admin/services" },
    { key: "travelBookings", Icon: Hotel, value: num(k.travelBookings.value), spark: col("travelBookings"), href: "/admin/travel/bookings" },
    { key: "newUsers", Icon: UserPlus, value: num(k.newUsers.value), spark: col("newUsers"), href: "/admin/users?segment=NEW" },
    { key: "activeUsers", Icon: Users, value: num(k.activeUsers.value), spark: col("activeUsers"), href: "/admin/users?segment=ACTIVE" },
    { key: "buyers", Icon: ShoppingBag, value: num(k.buyers.value) },
    { key: "repeatBuyerRate", Icon: Repeat, value: pct(k.repeatBuyerRate.value) },
    { key: "cancellationRate", Icon: CircleAlert, value: pct(k.cancellationRate.value), invert: true },
    { key: "supportCases", Icon: LifeBuoy, value: num(k.supportCases.value), invert: true, href: "/admin/support" },
  ];
  const statusLabel = (group: string, key: string) => (t.has(`status.${group}.${key}`) ? t(`status.${group}.${key}`) : key);
  const f = data.funnel;
  const funnel = [
    { key: "carts", value: f.carts },
    { key: "checkouts", value: f.checkouts },
    { key: "orders", value: f.orders },
    { key: "fulfilled", value: f.fulfilled },
  ];
  const funnelMax = Math.max(1, ...funnel.map((s) => s.value));
  const segmentTotal = data.breakdowns.customerSegments.reduce((a, r) => a + r.count, 0);
  const cohortWidth = Math.max(0, ...data.cohorts.map((c) => c.retention.length));
  return (
    <>
      <section className="gx-grid gx-grid--kpi" aria-label={t("kpis")}>
        {kpis.map(({ key, Icon, value, spark, invert, accent, href }) => {
          const body = (
            <>
              <span className="gx-kpi__label"><Icon size={16} aria-hidden="true" />{t(`kpi.${key}`)}</span>
              <span className="gx-kpi__value">{value}</span>
              {spark ? <Sparkline values={spark} color={accent ? "#f2b544" : undefined} /> : null}
              <span className="gx-kpi__foot"><Delta kpi={k[key]} invert={invert} /><span>{t("vsPrevious")}</span></span>
            </>
          );
          return href ? <Link key={key} href={href} className={`gx-kpi${accent ? " gx-kpi--accent" : ""}`}>{body}</Link> : <div key={key} className={`gx-kpi${accent ? " gx-kpi--accent" : ""}`}>{body}</div>;
        })}
      </section>

      <div className="gx-grid gx-grid--wide">
        <section className="gx-card">
          <header><h2>{t("revenueTrend")}</h2><p>{t("revenueTrendHint")}</p></header>
          <TrendChart
            labels={labels}
            series={[
              { key: "gmv", label: t("series.gmv"), color: "var(--chart-1)", values: col("gmv") },
              { key: "bookingValue", label: t("series.bookingValue"), color: "var(--chart-2)", values: col("bookingValue") },
            ]}
            formatValue={(v) => fmtCompact(v, locale)}
            formatLabel={label}
            ariaLabel={t("revenueTrend")}
          />
        </section>
        <section className="gx-card">
          <header><h2>{t("segments")}</h2><p>{t("segmentsHint")}</p></header>
          <Donut
            rows={data.breakdowns.customerSegments.map((r) => ({ key: r.key, label: t(`segment.${r.key}`), value: r.count }))}
            formatValue={num}
            ariaLabel={t("segments")}
            centerLabel={t("customers")}
          />
          {segmentTotal > 0 ? <p className="gx-muted" style={{ marginTop: 12 }}><Link className="underline" href="/admin/users">{t("openDirectory")}</Link></p> : null}
        </section>
      </div>

      <div className="gx-grid gx-grid--2">
        <section className="gx-card">
          <header><h2>{t("activityTrend")}</h2><p>{t("activityTrendHint")}</p></header>
          <ColumnChart
            labels={labels}
            series={[
              { key: "orders", label: t("series.orders"), color: "var(--chart-1)", values: col("orders") },
              { key: "serviceBookings", label: t("series.serviceBookings"), color: "var(--chart-3)", values: col("serviceBookings") },
              { key: "travelBookings", label: t("series.travelBookings"), color: "var(--chart-2)", values: col("travelBookings") },
            ]}
            formatValue={(v) => fmtNumber(Math.round(v), locale)}
            formatLabel={label}
            ariaLabel={t("activityTrend")}
          />
        </section>
        <section className="gx-card">
          <header><h2>{t("usersTrend")}</h2><p>{t("usersTrendHint")}</p></header>
          <TrendChart
            labels={labels}
            series={[
              { key: "activeUsers", label: t("series.activeUsers"), color: "var(--chart-4)", values: col("activeUsers") },
              { key: "newUsers", label: t("series.newUsers"), color: "var(--chart-3)", values: col("newUsers") },
            ]}
            formatValue={(v) => fmtNumber(Math.round(v), locale)}
            formatLabel={label}
            ariaLabel={t("usersTrend")}
          />
        </section>
      </div>

      <div className="gx-grid gx-grid--3">
        <section className="gx-card">
          <header><h2>{t("funnel")}</h2><p>{t("funnelHint")}</p></header>
          <div className="gx-funnel">
            {funnel.map((s, i) => (
              <div key={s.key} className="gx-funnel__step">
                <span>{t(`funnelStep.${s.key}`)}</span>
                <span className="gx-funnel__bar" style={{ width: `${Math.max(2, (s.value / funnelMax) * 100)}%` }} />
                <span><b>{num(s.value)}</b>{i > 0 && funnel[i - 1]!.value > 0 ? <span className="gx-funnel__rate"> · {pct(s.value / funnel[i - 1]!.value)}</span> : null}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="gx-card">
          <header><h2>{t("serviceMix")}</h2><p>{t("serviceMixHint")}</p></header>
          {data.breakdowns.serviceCategory.length ? <BarList rows={data.breakdowns.serviceCategory.map((r) => ({ key: r.key, label: statusLabel("category", r.key), value: r.count, hint: money(r.amount ?? 0) }))} formatValue={num} /> : <p className="gx-empty">{t("empty")}</p>}
        </section>
        <section className="gx-card">
          <header><h2>{t("orderStatus")}</h2><p>{t("orderStatusHint")}</p></header>
          {data.breakdowns.orderStatus.length ? <BarList rows={data.breakdowns.orderStatus.map((r) => ({ key: r.key, label: statusLabel("order", r.key), value: r.count }))} formatValue={num} /> : <p className="gx-empty">{t("empty")}</p>}
        </section>
      </div>

      <div className="gx-grid gx-grid--2">
        <section className="gx-card">
          <header><h2>{t("bookingStatus")}</h2><p>{t("bookingStatusHint")}</p></header>
          {data.breakdowns.serviceStatus.length ? <BarList rows={data.breakdowns.serviceStatus.map((r) => ({ key: r.key, label: statusLabel("booking", r.key), value: r.count }))} formatValue={num} /> : <p className="gx-empty">{t("empty")}</p>}
        </section>
        <section className="gx-card">
          <header><h2>{t("travelStatus")}</h2><p>{t("travelStatusHint")}</p></header>
          {data.breakdowns.travelStatus.length ? <BarList rows={data.breakdowns.travelStatus.map((r) => ({ key: r.key, label: statusLabel("travel", r.key), value: r.count }))} formatValue={num} /> : <p className="gx-empty">{t("empty")}</p>}
        </section>
      </div>

      <div className="gx-grid gx-grid--2">
        <TopTable title={t("topSellers")} rows={data.top.sellers} countLabel={t("columns.orders")} num={num} money={money} />
        <TopTable title={t("topProviders")} rows={data.top.providers} countLabel={t("columns.bookings")} num={num} money={money} />
        <TopTable title={t("topProducts")} rows={data.top.products} countLabel={t("columns.units")} num={num} money={money} />
        {data.top.customers ? <TopTable title={t("topCustomers")} rows={data.top.customers} countLabel={t("columns.purchases")} num={num} money={money} hrefOf={(id) => `/admin/users/${id}`} /> : null}
      </div>

      <section className="gx-card">
        <header><h2>{t("cohorts")}</h2><p>{t("cohortsHint")}</p></header>
        {data.cohorts.every((c) => c.size === 0) ? <p className="gx-empty">{t("empty")}</p> : (
          <div className="gx-table-wrap">
            <table className="gx-heat">
              <thead><tr><th scope="col">{t("cohortMonth")}</th><th scope="col">{t("cohortSize")}</th>{Array.from({ length: cohortWidth }, (_, i) => <th key={i} scope="col">{t("monthN", { n: num(i) })}</th>)}</tr></thead>
              <tbody>
                {data.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <th scope="row">{fmtDay(c.cohort, locale, { month: "long", year: "numeric" })}</th>
                    <td>{num(c.size)}</td>
                    {Array.from({ length: cohortWidth }, (_, i) => {
                      const v = c.retention[i];
                      if (v === undefined) return <td key={i} />;
                      return <td key={i} style={{ background: `color-mix(in srgb, var(--chart-1) ${Math.round(8 + v * 80)}%, transparent)`, color: v > 0.45 ? "#fff" : "var(--text-primary)" }}>{pct(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="gx-muted">{t("footnote")}</p>
    </>
  );
}

function TopTable({ title, rows, countLabel, num, money, hrefOf }: { title: string; rows: AdminReportOverviewDto["top"]["sellers"]; countLabel: string; num: (v: number) => string; money: (v: number) => string; hrefOf?: (id: string) => string }) {
  const t = useTranslations("adminReports");
  return (
    <section className="gx-card">
      <header><h2>{title}</h2></header>
      {rows.length === 0 ? <p className="gx-empty">{t("empty")}</p> : (
        <div className="gx-table-wrap">
          <table className="gx-table">
            <thead><tr><th scope="col">#</th><th scope="col">{t("columns.name")}</th><th scope="col" className="gx-num">{countLabel}</th><th scope="col" className="gx-num">{t("columns.amount")}</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{num(i + 1)}</td>
                  <td>{hrefOf ? <Link className="underline" href={hrefOf(r.id)}>{r.name || t("unnamed")}</Link> : r.name || t("unnamed")}</td>
                  <td className="gx-num">{num(r.count)}</td>
                  <td className="gx-num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
