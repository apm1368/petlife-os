"use client";

import { useState } from "react";
import {
  AGENTS,
  HOUSEHOLDS,
  LEADS,
  LEAD_KIND_LABEL,
  LEAD_SOURCES,
  MONTHLY_TREND,
  UPGRADES,
  formatIrr,
  formatNumber,
  type LeadKind,
} from "../crm-sample-data";
import { Kpi, Meter, Panel, PanelTitle, TableWrap, Tag, Td, Th } from "../crm-ui";

type Metric = "revenueIrr" | "newLeads" | "won" | "upgrades";

const METRIC_LABEL: Record<Metric, string> = {
  revenueIrr: "درآمد ماهانه",
  newLeads: "لیدهای جدید",
  won: "قراردادهای بسته‌شده",
  upgrades: "ارتقاها",
};

/**
 * A six-month column chart drawn as plain elements rather than a charting
 * library — four series of six points does not justify shipping one, and this
 * way the bars inherit the theme tokens directly.
 */
function TrendChart({ metric }: { metric: Metric }) {
  const values = MONTHLY_TREND.map((m) => m[metric]);
  const max = Math.max(...values);
  const format = metric === "revenueIrr" ? formatIrr : formatNumber;

  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height: "150px" }}>
        {MONTHLY_TREND.map((m) => {
          const value = m[metric];
          const heightPct = max === 0 ? 0 : Math.round((value / max) * 100);
          const isPeak = value === max;
          return (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-metadata tabular-nums text-text-secondary">{metric === "revenueIrr" ? formatNumber(Math.round(value / 1_000_000)) : formatNumber(value)}</span>
              <div
                className={`w-full rounded-t-md ${isPeak ? "bg-brand-mint" : "bg-brand-natural/45"}`}
                style={{ height: `${Math.max(heightPct, 3)}%` }}
                role="img"
                aria-label={`${m.month}: ${format(value)}`}
              />
              <span className="w-full truncate text-center text-metadata text-text-secondary" title={m.month}>
                {m.month}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-metadata text-text-secondary">
        {metric === "revenueIrr" ? "ارقام بر حسب میلیون ریال" : "تعداد در هر ماه"} · بیشترین مقدار: {format(max)}
      </p>
    </div>
  );
}

/** گزارشات — the numbers a lead would open on a Sunday morning. */
export function ReportsPanel() {
  const [metric, setMetric] = useState<Metric>("revenueIrr");

  const totalRevenue = MONTHLY_TREND.reduce((s, m) => s + m.revenueIrr, 0);
  // A single-month dataset has nothing to compare against, so it falls back to
  // itself and reports zero growth rather than dividing by a missing month.
  const lastMonth = MONTHLY_TREND[MONTHLY_TREND.length - 1] ?? MONTHLY_TREND[0];
  const prevMonth = MONTHLY_TREND[MONTHLY_TREND.length - 2] ?? lastMonth;
  const growth = prevMonth.revenueIrr === 0 ? 0 : Math.round(((lastMonth.revenueIrr - prevMonth.revenueIrr) / prevMonth.revenueIrr) * 100);
  const totalWon = MONTHLY_TREND.reduce((s, m) => s + m.won, 0);
  const totalLeads = MONTHLY_TREND.reduce((s, m) => s + m.newLeads, 0);

  const bySource = LEAD_SOURCES.map((s) => {
    const all = LEADS.filter((l) => l.source === s);
    const won = all.filter((l) => l.stage === "won").length;
    return { source: s, total: all.length, won, rate: all.length === 0 ? 0 : Math.round((won / all.length) * 100) };
  })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const byKind = (Object.keys(LEAD_KIND_LABEL) as LeadKind[])
    .map((k) => ({ kind: k, count: LEADS.filter((l) => l.kind === k).length, value: LEADS.filter((l) => l.kind === k).reduce((s, l) => s + l.potentialMonthlyIrr, 0) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.value - a.value);

  const byAgent = AGENTS.map((a) => ({
    agent: a,
    leads: LEADS.filter((l) => l.ownerId === a.id).length,
    won: LEADS.filter((l) => l.ownerId === a.id && l.stage === "won").length,
    upgrades: UPGRADES.filter((u) => u.ownerId === a.id && u.stage === "converted").length,
    households: HOUSEHOLDS.filter((h) => h.ownerId === a.id).length,
  })).filter((r) => r.leads > 0 || r.households > 0);

  const maxKindValue = Math.max(1, ...byKind.map((k) => k.value));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="درآمد شش‌ماهه" value={formatIrr(totalRevenue)} tone="brand" />
        <Kpi label="رشد ماه آخر" value={`${growth >= 0 ? "+" : ""}${formatNumber(growth)}٪`} sub={`نسبت به ${prevMonth.month}`} tone={growth >= 0 ? "success" : "urgent"} />
        <Kpi label="قراردادهای بسته‌شده" value={formatNumber(totalWon)} sub={`از ${formatNumber(totalLeads)} لید`} />
        <Kpi label="نرخ تبدیل کلی" value={`${formatNumber(totalLeads === 0 ? 0 : Math.round((totalWon / totalLeads) * 100))}٪`} tone="success" />
      </div>

      <Panel>
        <PanelTitle
          title="روند شش ماه گذشته"
          hint={METRIC_LABEL[metric]}
          action={
            <div className="flex flex-wrap gap-1">
              {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  aria-pressed={metric === m}
                  className={
                    "rounded-full border px-2.5 py-1 text-metadata outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
                    (metric === m ? "border-brand-mint bg-brand-mint/10 text-brand-mint-strong" : "border-border-subtle text-text-secondary hover:bg-surface-subtle")
                  }
                >
                  {METRIC_LABEL[m]}
                </button>
              ))}
            </div>
          }
        />
        <TrendChart metric={metric} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title="اثربخشی منابع" hint="کدام کانال واقعاً به قرارداد می‌رسد" />
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>منبع</Th>
                  <Th>لید</Th>
                  <Th>قرارداد</Th>
                  <Th>نرخ</Th>
                </tr>
              </thead>
              <tbody>
                {bySource.map((r) => (
                  <tr key={r.source}>
                    <Td>{r.source}</Td>
                    <Td className="tabular-nums">{formatNumber(r.total)}</Td>
                    <Td className="tabular-nums">{formatNumber(r.won)}</Td>
                    <Td>
                      <Tag tone={r.rate >= 30 ? "success" : r.rate > 0 ? "attention" : "neutral"}>{formatNumber(r.rate)}٪</Tag>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>

        <Panel>
          <PanelTitle title="ارزش قیف به تفکیک نوع کسب‌وکار" hint="ارزش ماهانه برآوردی" />
          <ul className="flex flex-col gap-2.5">
            {byKind.map((k) => (
              <li key={k.kind} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-metadata text-text-primary">{LEAD_KIND_LABEL[k.kind]}</span>
                  <span className="shrink-0 text-metadata tabular-nums text-text-secondary">{formatIrr(k.value)}</span>
                </div>
                <Meter value={k.value} max={maxKindValue} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <PanelTitle title="عملکرد کارشناسان" hint="بدون هدف‌گذاری فعلاً — فقط آنچه رخ داده" />
        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>کارشناس</Th>
                <Th>تیم</Th>
                <Th>لیدها</Th>
                <Th>قرارداد</Th>
                <Th>ارتقای موفق</Th>
                <Th>خانوارهای تحت مدیریت</Th>
              </tr>
            </thead>
            <tbody>
              {byAgent.map((r) => (
                <tr key={r.agent.id} className="hover:bg-surface-subtle">
                  <Td>{r.agent.name}</Td>
                  <Td className="text-text-secondary">{r.agent.team === "acquisition" ? "جذب" : "موفقیت مشتری"}</Td>
                  <Td className="tabular-nums">{formatNumber(r.leads)}</Td>
                  <Td className="tabular-nums">{formatNumber(r.won)}</Td>
                  <Td className="tabular-nums">{formatNumber(r.upgrades)}</Td>
                  <Td className="tabular-nums">{formatNumber(r.households)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </div>
  );
}
