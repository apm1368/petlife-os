"use client";

import { useState } from "react";
import {
  CA_AGENTS,
  CA_CALLS,
  CA_EVALUATIONS,
  CALL_OUTCOME_LABEL,
  EVAL_REASON_LABEL,
  QA_CRITERIA,
  QA_CRITICAL_ERRORS,
  QA_LEVELS,
  caAgentName,
  caCustomerName,
  formatClock,
  relativeDays,
} from "../ca-sample-data";
import { EmptyRow, Kpi, Meter, Panel, PanelTitle, TableWrap, Tag, Td, Th, formatNumber, type Tone } from "../../console-ui";

type Tab = "queue" | "recorded" | "scorecards" | "scorecard_model";

const TAB_LABEL: Record<Tab, string> = {
  queue: "صف ارزیابی",
  recorded: "ارزیابی‌های ثبت‌شده",
  scorecards: "کارنامه کارشناسان",
  scorecard_model: "اسکورکارت",
};

function scoreTone(score: number): Tone {
  if (score >= 85) return "success";
  if (score >= 70) return "attention";
  return "urgent";
}

/**
 * کنترل کیفیت — evaluation queue, recorded evaluations, agent scorecards, and
 * the scorecard model itself.
 *
 * The weights shown in «اسکورکارت» are the same constant the evaluations are
 * scored against, so the model on screen is genuinely the one in force rather
 * than a documentation page that can drift.
 */
export function QualityPanel() {
  const [tab, setTab] = useState<Tab>("queue");

  const recordable = CA_CALLS.filter((c) => c.hasRecording);
  const queue = recordable.filter((c) => !c.evaluated);
  const avgScore = CA_EVALUATIONS.length === 0 ? 0 : Math.round(CA_EVALUATIONS.reduce((s, e) => s + e.score, 0) / CA_EVALUATIONS.length);
  const withCritical = CA_EVALUATIONS.filter((e) => e.criticalError !== null);
  const totalWeight = QA_CRITERIA.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="در صف ارزیابی" value={formatNumber(queue.length)} tone={queue.length > 3 ? "attention" : "neutral"} />
        <Kpi label="ارزیابی‌های ثبت‌شده" value={formatNumber(CA_EVALUATIONS.length)} />
        <Kpi label="میانگین امتیاز" value={formatNumber(avgScore)} sub="از ۱۰۰" tone={scoreTone(avgScore)} />
        <Kpi label="خطای بحرانی" value={formatNumber(withCritical.length)} tone={withCritical.length > 0 ? "urgent" : "success"} />
      </div>

      <div className="flex flex-wrap gap-1">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={
              "rounded-full border px-3 py-1 text-metadata outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
              (tab === t ? "border-brand-mint bg-brand-mint/10 text-brand-mint-strong" : "border-border-subtle text-text-secondary hover:bg-surface-subtle")
            }
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        <Panel>
          <PanelTitle title="صف ارزیابی" hint="تماس‌های دارای فایل ضبط که هنوز ارزیابی نشده‌اند" />
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>تماس</Th>
                  <Th>کارشناس</Th>
                  <Th>مشتری</Th>
                  <Th>نتیجه</Th>
                  <Th>مدت</Th>
                  <Th>زمان</Th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <EmptyRow colSpan={6} label="صف ارزیابی خالی است." />
                ) : (
                  queue.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-subtle">
                      <Td className="text-text-secondary">{c.id}</Td>
                      <Td>{caAgentName(c.agentId)}</Td>
                      <Td className="text-text-secondary">{caCustomerName(c.customerId)}</Td>
                      <Td className="text-text-secondary">{CALL_OUTCOME_LABEL[c.outcome]}</Td>
                      <Td className="tabular-nums">{formatClock(c.talkSeconds)}</Td>
                      <Td className="text-text-secondary">{relativeDays(c.daysAgo)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}

      {tab === "recorded" ? (
        <Panel>
          <PanelTitle title="ارزیابی‌های ثبت‌شده" hint="هر ارزیابی با نقطه قوت، نقطه بهبود و خطای بحرانی" />
          <div className="flex flex-col gap-2">
            {CA_EVALUATIONS.map((e) => (
              <article key={e.id} className="rounded-md border border-border-subtle bg-surface-subtle p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-metadata text-text-primary">
                      {caAgentName(e.agentId)} · تماس {e.callId}
                    </p>
                    <p className="mt-0.5 text-metadata text-text-secondary">
                      ارزیاب {caAgentName(e.evaluatorId)} · {EVAL_REASON_LABEL[e.reason]} · {relativeDays(e.daysAgo)}
                    </p>
                  </div>
                  <Tag tone={e.criticalError ? "urgent" : scoreTone(e.score)}>{formatNumber(e.score)} از ۱۰۰</Tag>
                </div>
                {e.criticalError ? (
                  <p className="mt-2 rounded-md border border-state-urgent/40 bg-state-urgent/10 px-2.5 py-1.5 text-metadata text-state-urgent">
                    خطای بحرانی: {e.criticalError}
                  </p>
                ) : null}
                <dl className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-metadata text-text-secondary">نقطه قوت:</dt>
                    <dd className="text-metadata text-text-primary">{e.strength}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-metadata text-text-secondary">نقطه بهبود:</dt>
                    <dd className="text-metadata text-text-primary">{e.improvement}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}

      {tab === "scorecards" ? (
        <Panel>
          <PanelTitle title="کارنامه کارشناسان" hint="میانگین امتیاز و پوشش ارزیابی هر نفر" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CA_AGENTS.filter((a) => a.role === "agent").map((a) => {
              const evals = CA_EVALUATIONS.filter((e) => e.agentId === a.id);
              const calls = recordable.filter((c) => c.agentId === a.id);
              const avg = evals.length === 0 ? null : Math.round(evals.reduce((s, e) => s + e.score, 0) / evals.length);
              const coverage = calls.length === 0 ? 0 : Math.round((evals.length / calls.length) * 100);
              return (
                <div key={a.id} className="rounded-md border border-border-subtle bg-surface-subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-metadata text-text-primary">{a.name}</span>
                    {avg === null ? <Tag tone="neutral">بدون ارزیابی</Tag> : <Tag tone={scoreTone(avg)}>{formatNumber(avg)}</Tag>}
                  </div>
                  <p className="mt-1 text-metadata text-text-secondary">
                    {formatNumber(evals.length)} ارزیابی از {formatNumber(calls.length)} تماس · پوشش {formatNumber(coverage)}٪
                  </p>
                  {avg === null ? null : (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <Meter value={avg} max={100} tone={scoreTone(avg)} />
                      <Meter value={coverage} max={100} tone="brand" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-metadata text-text-secondary">
            حد نصاب: بالای ۸۵ در مسیر درست · ۷۰ تا ۸۵ نیازمند تلاش بیشتر · زیر ۷۰ نیازمند کوچینگ.
          </p>
        </Panel>
      ) : null}

      {tab === "scorecard_model" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelTitle title="معیارهای ارزیابی" hint={`مجموع وزن‌ها: ${formatNumber(totalWeight)}`} />
            <TableWrap>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>معیار</Th>
                    <Th>وزن</Th>
                    <Th>سهم</Th>
                  </tr>
                </thead>
                <tbody>
                  {QA_CRITERIA.map((c) => (
                    <tr key={c.key}>
                      <Td>{c.label}</Td>
                      <Td className="tabular-nums">{formatNumber(c.weight)}</Td>
                      <Td>
                        <div className="w-24">
                          <Meter value={c.weight} max={Math.max(...QA_CRITERIA.map((x) => x.weight))} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel>
              <PanelTitle title="سطوح امتیازدهی" hint="ضریبی که در وزن هر معیار ضرب می‌شود" />
              <ul className="flex flex-col gap-2">
                {QA_LEVELS.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                    <span className="text-metadata text-text-primary">{l.label}</span>
                    <span className="text-metadata tabular-nums text-text-secondary">×{formatNumber(l.factor)}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelTitle title="خطاهای بحرانی" hint="وقوع هرکدام، امتیاز کل ارزیابی را صفر می‌کند" />
              <ul className="flex flex-wrap gap-2">
                {QA_CRITICAL_ERRORS.map((e) => (
                  <li key={e}>
                    <Tag tone="urgent">{e}</Tag>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
