"use client";

import { useState } from "react";
import {
  CA_AGENTS,
  CA_CALLS,
  CA_COMPLAINTS,
  CA_EVALUATIONS,
  CA_SURVEYS,
  CA_TICKETS,
  CONTACT_REASONS,
  CX_QUESTIONS,
  OPEN_TICKET_STATUSES,
  RESOLUTION_LABEL,
  ROOT_CAUSE_LABEL,
  type Resolution,
  type RootCause,
  formatClock,
  reasonLabel,
  slaState,
  surveyAverage,
} from "../ca-sample-data";
import { Kpi, Meter, Panel, PanelTitle, TableWrap, Tag, Td, Th, formatNumber, type Tone } from "../../console-ui";

type Scope = "team" | "me";

/** گزارش‌ها — the operational picture: SLA, handling time, causes and satisfaction. */
export function ReportsPanel({ meId }: { meId: string }) {
  const [scope, setScope] = useState<Scope>("team");

  const tickets = scope === "me" ? CA_TICKETS.filter((t) => t.ownerId === meId) : CA_TICKETS;
  const calls = scope === "me" ? CA_CALLS.filter((c) => c.agentId === meId) : CA_CALLS;
  const evaluations = scope === "me" ? CA_EVALUATIONS.filter((e) => e.agentId === meId) : CA_EVALUATIONS;

  const breached = tickets.filter((t) => slaState(t) === "breached");
  const adherence = tickets.length === 0 ? 0 : Math.round(((tickets.length - breached.length) / tickets.length) * 100);
  const answered = calls.filter((c) => c.talkSeconds > 0);
  const aht = answered.length === 0 ? 0 : Math.round(answered.reduce((s, c) => s + c.talkSeconds, 0) / answered.length);
  // First-contact resolution: answered calls that closed without spawning a follow-up or escalation.
  const fcr = answered.length === 0 ? 0 : Math.round((answered.filter((c) => c.outcome === "answered").length / answered.length) * 100);
  const avgQa = evaluations.length === 0 ? 0 : Math.round(evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length);
  const avgCsat = CA_SURVEYS.length === 0 ? 0 : Math.round((CA_SURVEYS.reduce((s, v) => s + surveyAverage(v), 0) / CA_SURVEYS.length) * 10) / 10;

  const byReason = CONTACT_REASONS.map((r) => ({ key: r.key, label: r.label, count: tickets.filter((t) => t.reasonKey === r.key).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxReason = Math.max(1, ...byReason.map((r) => r.count));

  const byRootCause = (Object.keys(ROOT_CAUSE_LABEL) as RootCause[])
    .map((rc) => ({ rc, count: tickets.filter((t) => t.rootCause === rc).length }))
    .filter((r) => r.count > 0);

  const byResolution = (Object.keys(RESOLUTION_LABEL) as Resolution[])
    .map((r) => ({ r, count: tickets.filter((t) => t.resolution === r).length }))
    .filter((x) => x.count > 0);

  const csatByQuestion = CX_QUESTIONS.map((q) => {
    const values = CA_SURVEYS.map((s) => s.answers[q.key] ?? 0).filter((v) => v > 0);
    return { key: q.key, label: q.label, avg: values.length === 0 ? 0 : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 };
  });

  function csatTone(avg: number): Tone {
    if (avg >= 4) return "success";
    if (avg >= 3) return "attention";
    return "urgent";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        {(["team", "me"] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            aria-pressed={scope === s}
            className={
              "rounded-full border px-3 py-1 text-metadata outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
              (scope === s ? "border-brand-mint bg-brand-mint/10 text-brand-mint-strong" : "border-border-subtle text-text-secondary hover:bg-surface-subtle")
            }
          >
            {s === "team" ? "گزارش تیم" : "گزارش شخصی"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="پایبندی SLA" value={`${formatNumber(adherence)}٪`} sub={`${formatNumber(breached.length)} نقض`} tone={adherence >= 90 ? "success" : adherence >= 70 ? "attention" : "urgent"} />
        <Kpi label="میانگین مدت رسیدگی" value={formatClock(aht)} sub="AHT" />
        <Kpi label="حل در تماس اول" value={`${formatNumber(fcr)}٪`} tone={fcr >= 60 ? "success" : "attention"} />
        <Kpi label="میانگین امتیاز کیفیت" value={formatNumber(avgQa)} sub="از ۱۰۰" tone={avgQa >= 85 ? "success" : avgQa >= 70 ? "attention" : "urgent"} />
      </div>

      <Panel>
        <PanelTitle title="دلایل تماس" hint="تیکت‌ها به تفکیک دسته — نشان می‌دهد فشار از کجا می‌آید" />
        <ul className="flex flex-col gap-2.5">
          {byReason.map((r) => (
            <li key={r.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-metadata text-text-primary">{r.label}</span>
                <span className="shrink-0 text-metadata tabular-nums text-text-secondary">{formatNumber(r.count)}</span>
              </div>
              <Meter value={r.count} max={maxReason} />
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title="رضایت مشتری" hint={`میانگین کل: ${formatNumber(avgCsat)} از ۵`} />
          <ul className="flex flex-col gap-2.5">
            {csatByQuestion.map((q) => (
              <li key={q.key} className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-metadata text-text-secondary">{q.label}</span>
                  <Tag tone={csatTone(q.avg)}>{formatNumber(q.avg)}</Tag>
                </div>
                <Meter value={q.avg} max={5} tone={csatTone(q.avg)} />
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelTitle title="علت ریشه‌ای" hint="فقط تیکت‌های پایان‌یافته علت ثبت‌شده دارند" />
            {byRootCause.length === 0 ? (
              <p className="py-4 text-center text-metadata text-text-secondary">هنوز علت ریشه‌ای ثبت نشده است.</p>
            ) : (
              <TableWrap>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>علت</Th>
                      <Th>تعداد</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRootCause.map((r) => (
                      <tr key={r.rc}>
                        <Td>{ROOT_CAUSE_LABEL[r.rc]}</Td>
                        <Td className="tabular-nums">{formatNumber(r.count)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Panel>

          <Panel>
            <PanelTitle title="نوع رفع" hint="چطور تیکت‌ها بسته شده‌اند" />
            {byResolution.length === 0 ? (
              <p className="py-4 text-center text-metadata text-text-secondary">هنوز تیکتی با نوع رفع ثبت نشده است.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {byResolution.map((r) => (
                  <li key={r.r} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                    <span className="text-metadata text-text-primary">{RESOLUTION_LABEL[r.r]}</span>
                    <span className="text-metadata tabular-nums text-text-secondary">{formatNumber(r.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelTitle title="عملکرد کارشناسان" hint="تیکت باز، تماس و امتیاز کیفیت" />
        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>کارشناس</Th>
                <Th>تیکت باز</Th>
                <Th>نقض SLA</Th>
                <Th>تماس</Th>
                <Th>میانگین مکالمه</Th>
                <Th>امتیاز کیفیت</Th>
              </tr>
            </thead>
            <tbody>
              {CA_AGENTS.filter((a) => a.role === "agent").map((a) => {
                const open = CA_TICKETS.filter((t) => t.ownerId === a.id && OPEN_TICKET_STATUSES.includes(t.status));
                const agentCalls = CA_CALLS.filter((c) => c.agentId === a.id && c.talkSeconds > 0);
                const agentEvals = CA_EVALUATIONS.filter((e) => e.agentId === a.id);
                const avg = agentEvals.length === 0 ? null : Math.round(agentEvals.reduce((s, e) => s + e.score, 0) / agentEvals.length);
                const agentAht = agentCalls.length === 0 ? 0 : Math.round(agentCalls.reduce((s, c) => s + c.talkSeconds, 0) / agentCalls.length);
                return (
                  <tr key={a.id} className="hover:bg-surface-subtle">
                    <Td>{a.name}</Td>
                    <Td className="tabular-nums">{formatNumber(open.length)}</Td>
                    <Td className="tabular-nums">{formatNumber(open.filter((t) => slaState(t) === "breached").length)}</Td>
                    <Td className="tabular-nums">{formatNumber(agentCalls.length)}</Td>
                    <Td className="tabular-nums">{formatClock(agentAht)}</Td>
                    <Td>{avg === null ? <Tag tone="neutral">بدون ارزیابی</Tag> : <Tag tone={avg >= 85 ? "success" : avg >= 70 ? "attention" : "urgent"}>{formatNumber(avg)}</Tag>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <p className="mt-3 text-metadata text-text-secondary">
          شکایات ثبت‌شده: {formatNumber(CA_COMPLAINTS.length)} · دسته‌های فعال: {byReason.map((r) => reasonLabel(r.key)).slice(0, 3).join("، ")}
        </p>
      </Panel>
    </div>
  );
}
