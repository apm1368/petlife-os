"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AdminReportOverviewDto } from "@petlife/types";
import { ChartColumn, HeartPulse, ShoppingBag, UserPlus, Wallet } from "@petlife/ui";
import Link from "@/features/navigation/localized-link";
import { adminReportsService } from "@/services/admin-reports.service";
import { Sparkline, TrendChart } from "./charts";
import { asLocale, fmtCompact, fmtDay, fmtNumber, fmtPercent, shiftDays, tehranToday } from "./report-format";

/** The last 30 days at a glance on the dashboard; the full picture lives on /admin/reports. */
export function DashboardInsights() {
  const t = useTranslations("adminReports");
  const locale = asLocale(useLocale());
  const [data, setData] = useState<AdminReportOverviewDto | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const to = tehranToday();
    adminReportsService.overview({ from: shiftDays(to, -29), to, granularity: "day" }, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  if (failed) return null;
  if (!data) return <div className="gx-skel" style={{ height: 220 }} aria-label={t("loading")} />;
  const k = data.kpis;
  const col = (key: "gmv" | "orders" | "newUsers" | "bookingValue") => data.series.map((p) => p[key]);
  const change = (v: number | null) => (v === null ? t("new") : `${v > 0 ? "+" : ""}${fmtPercent(v, locale)}`);
  const tiles = [
    { key: "gmv", Icon: Wallet, value: t("money", { amount: fmtCompact(k.gmv.value, locale) }), change: k.gmv.change, spark: col("gmv"), accent: true },
    { key: "orders", Icon: ShoppingBag, value: fmtNumber(k.orders.value, locale), change: k.orders.change, spark: col("orders") },
    { key: "bookingValue", Icon: HeartPulse, value: t("money", { amount: fmtCompact(k.bookingValue.value, locale) }), change: k.bookingValue.change, spark: col("bookingValue") },
    { key: "newUsers", Icon: UserPlus, value: fmtNumber(k.newUsers.value, locale), change: k.newUsers.change, spark: col("newUsers") },
  ] as const;
  return (
    <section className="gx-page" aria-label={t("dashboard.title")}>
      <div className="gx-grid gx-grid--kpi">
        {tiles.map(({ key, Icon, value, change: c, spark, ...rest }) => (
          <Link key={key} href="/admin/reports" className={`gx-kpi${"accent" in rest ? " gx-kpi--accent" : ""}`}>
            <span className="gx-kpi__label"><Icon size={16} aria-hidden="true" />{t(`kpi.${key}`)}</span>
            <span className="gx-kpi__value">{value}</span>
            <Sparkline values={[...spark]} color={"accent" in rest ? "#f2b544" : undefined} />
            <span className="gx-kpi__foot"><span className={`gx-delta ${c === null || c >= 0 ? "gx-delta--up" : "gx-delta--down"}`}>{change(c)}</span><span>{t("dashboard.last30")}</span></span>
          </Link>
        ))}
      </div>
      <section className="gx-card">
        <header><h2>{t("revenueTrend")}</h2><Link href="/admin/reports" className="gx-btn"><ChartColumn size={16} aria-hidden="true" />{t("dashboard.openReports")}</Link></header>
        <TrendChart
          labels={data.series.map((p) => p.bucket)}
          series={[
            { key: "gmv", label: t("series.gmv"), color: "var(--chart-1)", values: col("gmv") },
            { key: "bookingValue", label: t("series.bookingValue"), color: "var(--chart-2)", values: col("bookingValue") },
          ]}
          formatValue={(v) => fmtCompact(v, locale)}
          formatLabel={(d) => fmtDay(d, locale)}
          ariaLabel={t("revenueTrend")}
          height={200}
        />
      </section>
    </section>
  );
}
