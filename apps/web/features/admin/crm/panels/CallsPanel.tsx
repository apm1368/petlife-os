"use client";

import { useMemo, useState } from "react";
import {
  AGENTS,
  CALLS,
  CALL_RESULT_LABEL,
  type CallResult,
  type CrmCall,
  agentName,
  formatDuration,
  formatNumber,
  householdName,
  leadName,
  relativeDays,
} from "../crm-sample-data";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  Kpi,
  Meter,
  Panel,
  PanelTitle,
  SelectFilter,
  TableWrap,
  Tag,
  Td,
  Th,
  type Tone,
} from "../crm-ui";

const RESULT_TONE: Record<CallResult, Tone> = { answered: "success", no_answer: "attention", callback: "brand", rejected: "urgent" };

function qaTone(score: number): Tone {
  if (score >= 85) return "success";
  if (score >= 70) return "attention";
  return "urgent";
}

function linkedLabel(call: CrmCall): string {
  if (call.leadId) return leadName(call.leadId);
  if (call.householdId) return householdName(call.householdId);
  return "—";
}

/** مرکز تماس و ارزیابی — call log plus the quality review queue sitting on top of it. */
export function CallsPanel() {
  const [agent, setAgent] = useState<string>("all");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [result, setResult] = useState<CallResult | "all">("all");
  const [qa, setQa] = useState<"all" | "pending" | "reviewed">("all");

  const rows = useMemo(
    () =>
      CALLS.filter((c) => {
        if (agent !== "all" && c.agentId !== agent) return false;
        if (direction !== "all" && c.direction !== direction) return false;
        if (result !== "all" && c.result !== result) return false;
        if (qa !== "all" && c.qaStatus !== qa) return false;
        return true;
      }),
    [agent, direction, result, qa],
  );

  const answered = CALLS.filter((c) => c.result === "answered");
  const answerRate = CALLS.length === 0 ? 0 : Math.round((answered.length / CALLS.length) * 100);
  const avgDuration = answered.length === 0 ? 0 : Math.round(answered.reduce((s, c) => s + c.durationSec, 0) / answered.length);
  const pendingQa = CALLS.filter((c) => c.qaStatus === "pending");
  const scored = CALLS.filter((c) => c.qaScore !== null);
  const avgQa = scored.length === 0 ? 0 : Math.round(scored.reduce((s, c) => s + (c.qaScore as number), 0) / scored.length);

  // Per-agent quality, so a coaching conversation has something concrete behind it.
  const byAgent = AGENTS.map((a) => {
    const calls = CALLS.filter((c) => c.agentId === a.id);
    const agentScored = calls.filter((c) => c.qaScore !== null);
    return {
      agent: a,
      calls: calls.length,
      answered: calls.filter((c) => c.result === "answered").length,
      avgScore: agentScored.length === 0 ? null : Math.round(agentScored.reduce((s, c) => s + (c.qaScore as number), 0) / agentScored.length),
    };
  }).filter((r) => r.calls > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="تماس‌های ثبت‌شده" value={formatNumber(CALLS.length)} />
        <Kpi label="نرخ پاسخ" value={`${formatNumber(answerRate)}٪`} tone={answerRate >= 60 ? "success" : "attention"} />
        <Kpi label="میانگین مدت تماس" value={formatDuration(avgDuration)} sub="فقط تماس‌های پاسخ‌داده‌شده" />
        <Kpi label="در صف ارزیابی" value={formatNumber(pendingQa.length)} sub={`میانگین کیفیت ${formatNumber(avgQa)}`} tone={pendingQa.length > 2 ? "attention" : "neutral"} />
      </div>

      <Panel>
        <PanelTitle title="کیفیت به تفکیک کارشناس" hint="میانگین امتیاز ارزیابی تماس" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {byAgent.map(({ agent: a, calls, answered: ans, avgScore }) => (
            <div key={a.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-metadata text-text-primary">{a.name}</span>
                {avgScore === null ? <Tag tone="neutral">ارزیابی نشده</Tag> : <Tag tone={qaTone(avgScore)}>{formatNumber(avgScore)}</Tag>}
              </div>
              <p className="mt-1 text-metadata text-text-secondary">
                {formatNumber(calls)} تماس · {formatNumber(ans)} پاسخ‌داده‌شده
              </p>
              {avgScore === null ? null : <div className="mt-1.5"><Meter value={avgScore} max={100} tone={qaTone(avgScore)} /></div>}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelTitle title="گزارش تماس‌ها" hint={`${formatNumber(rows.length)} مورد`} />
        <FilterBar>
          <FilterField label="کارشناس">
            <SelectFilter value={agent} onChange={setAgent} options={[{ value: "all", label: "همه کارشناسان" }, ...AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
          </FilterField>
          <FilterField label="جهت">
            <SelectFilter
              value={direction}
              onChange={setDirection}
              options={[
                { value: "all", label: "ورودی و خروجی" },
                { value: "in", label: "ورودی" },
                { value: "out", label: "خروجی" },
              ]}
            />
          </FilterField>
          <FilterField label="نتیجه">
            <SelectFilter
              value={result}
              onChange={setResult}
              options={[{ value: "all", label: "همه نتایج" }, ...(Object.keys(CALL_RESULT_LABEL) as CallResult[]).map((r) => ({ value: r, label: CALL_RESULT_LABEL[r] }))]}
            />
          </FilterField>
          <FilterField label="ارزیابی">
            <SelectFilter
              value={qa}
              onChange={setQa}
              options={[
                { value: "all", label: "همه" },
                { value: "pending", label: "ارزیابی نشده" },
                { value: "reviewed", label: "ارزیابی شد" },
              ]}
            />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>کد</Th>
                <Th>کارشناس</Th>
                <Th>طرف تماس</Th>
                <Th>جهت</Th>
                <Th>نتیجه</Th>
                <Th>مدت</Th>
                <Th>ارزیابی</Th>
                <Th>زمان</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8} label="تماسی با این فیلترها پیدا نشد." />
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-subtle">
                    <Td className="text-text-secondary">{c.id}</Td>
                    <Td>{agentName(c.agentId)}</Td>
                    <Td className="text-text-secondary">{linkedLabel(c)}</Td>
                    <Td className="text-text-secondary">{c.direction === "in" ? "ورودی" : "خروجی"}</Td>
                    <Td>
                      <Tag tone={RESULT_TONE[c.result]}>{CALL_RESULT_LABEL[c.result]}</Tag>
                    </Td>
                    <Td className="tabular-nums">{formatDuration(c.durationSec)}</Td>
                    <Td>{c.qaScore === null ? <Tag tone="neutral">در صف</Tag> : <Tag tone={qaTone(c.qaScore)}>{formatNumber(c.qaScore)}</Tag>}</Td>
                    <Td className="text-text-secondary">{relativeDays(c.daysAgo)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </div>
  );
}
