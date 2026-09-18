"use client";

import { useMemo, useState } from "react";
import {
  CALL_OUTCOME_LABEL,
  CA_AGENTS,
  CA_CALLS,
  type CallOutcome,
  caAgentName,
  caCustomerName,
  formatClock,
  formatMinutes,
} from "../ca-sample-data";
import { EmptyRow, FilterBar, FilterField, Kpi, Panel, PanelTitle, SelectFilter, TableWrap, Tag, Td, Th, formatNumber, type Tone } from "../../console-ui";

const OUTCOME_TONE: Partial<Record<CallOutcome, Tone>> = {
  answered: "success",
  ticket_created: "brand",
  follow_up: "attention",
  callback: "attention",
  waiting_customer: "attention",
  to_finance: "concern",
  to_providers: "concern",
  escalated: "concern",
  dropped: "urgent",
  no_answer: "urgent",
  unresolved: "urgent",
  wrong_number: "neutral",
};

/**
 * تماس‌ها — the VoIP archive.
 *
 * Playing a recording is an access event, not a neutral read: the console
 * states that it is written to the change log, because a customer's call is
 * their data and listening to it should leave a trace.
 */
export function CallsPanel() {
  const [agent, setAgent] = useState<string>("all");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [outcome, setOutcome] = useState<CallOutcome | "all">("all");
  const [evaluated, setEvaluated] = useState<"all" | "yes" | "no">("all");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      CA_CALLS.filter((c) => {
        if (agent !== "all" && c.agentId !== agent) return false;
        if (direction !== "all" && c.direction !== direction) return false;
        if (outcome !== "all" && c.outcome !== outcome) return false;
        if (evaluated === "yes" && !c.evaluated) return false;
        if (evaluated === "no" && c.evaluated) return false;
        return true;
      }),
    [agent, direction, outcome, evaluated],
  );

  const answered = CA_CALLS.filter((c) => c.talkSeconds > 0);
  const totalTalk = CA_CALLS.reduce((s, c) => s + c.talkSeconds, 0);
  const avgTalk = answered.length === 0 ? 0 : Math.round(totalTalk / answered.length);
  const avgWait = CA_CALLS.length === 0 ? 0 : Math.round(CA_CALLS.reduce((s, c) => s + c.waitSeconds, 0) / CA_CALLS.length);
  const withRecording = CA_CALLS.filter((c) => c.hasRecording);
  const coverage = withRecording.length === 0 ? 0 : Math.round((withRecording.filter((c) => c.evaluated).length / withRecording.length) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="تعداد تماس" value={formatNumber(CA_CALLS.length)} sub={`${formatNumber(answered.length)} پاسخ‌داده‌شده`} />
        <Kpi label="مجموع مکالمه" value={formatMinutes(totalTalk)} />
        <Kpi label="میانگین مدت" value={formatClock(avgTalk)} sub={`میانگین انتظار ${formatNumber(avgWait)} ثانیه`} />
        <Kpi label="پوشش ارزیابی" value={`${formatNumber(coverage)}٪`} sub="از تماس‌های دارای فایل ضبط" tone={coverage >= 50 ? "success" : "attention"} />
      </div>

      <Panel>
        <PanelTitle title="آرشیو تماس‌ها" hint={`${formatNumber(rows.length)} مورد`} />
        <FilterBar>
          <FilterField label="کارشناس">
            <SelectFilter value={agent} onChange={setAgent} options={[{ value: "all", label: "همه کارشناسان" }, ...CA_AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
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
              value={outcome}
              onChange={setOutcome}
              options={[{ value: "all", label: "همه نتایج" }, ...(Object.keys(CALL_OUTCOME_LABEL) as CallOutcome[]).map((o) => ({ value: o, label: CALL_OUTCOME_LABEL[o] }))]}
            />
          </FilterField>
          <FilterField label="ارزیابی">
            <SelectFilter
              value={evaluated}
              onChange={setEvaluated}
              options={[
                { value: "all", label: "همه" },
                { value: "no", label: "ارزیابی‌نشده" },
                { value: "yes", label: "ارزیابی‌شده" },
              ]}
            />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>شناسه</Th>
                <Th>کارشناس</Th>
                <Th>مشتری</Th>
                <Th>جهت</Th>
                <Th>نتیجه</Th>
                <Th>مکالمه</Th>
                <Th>انتظار</Th>
                <Th>تیکت</Th>
                <Th>ارزیابی</Th>
                <Th>فایل ضبط</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={10} label="تماسی با این فیلترها پیدا نشد." />
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-subtle">
                    <Td className="text-text-secondary">{c.id}</Td>
                    <Td>{caAgentName(c.agentId)}</Td>
                    <Td className="text-text-secondary">{caCustomerName(c.customerId)}</Td>
                    <Td className="text-text-secondary">{c.direction === "in" ? "ورودی" : "خروجی"}</Td>
                    <Td>
                      <Tag tone={OUTCOME_TONE[c.outcome] ?? "neutral"}>{CALL_OUTCOME_LABEL[c.outcome]}</Tag>
                    </Td>
                    <Td className="tabular-nums">{formatClock(c.talkSeconds)}</Td>
                    <Td className="tabular-nums text-text-secondary">{c.waitSeconds === 0 ? "—" : `${formatNumber(c.waitSeconds)} ثانیه`}</Td>
                    <Td className="text-text-secondary">{c.linkedTicketId ?? "—"}</Td>
                    <Td>{c.evaluated ? <Tag tone="success">ارزیابی‌شده</Tag> : <Tag tone="neutral">در صف</Tag>}</Td>
                    <Td>
                      {c.hasRecording ? (
                        <button
                          type="button"
                          onClick={() => setPlayingId(playingId === c.id ? null : c.id)}
                          className="rounded-md border border-border-subtle px-2 py-0.5 text-metadata text-text-primary outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          {playingId === c.id ? "توقف" : "پخش"}
                        </button>
                      ) : (
                        <span className="text-metadata text-text-secondary">ندارد</span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>

        {playingId ? (
          <p className="mt-3 rounded-md border border-brand-mint/40 bg-brand-mint/10 px-3 py-2 text-metadata text-brand-mint-strong">
            در حال پخش فایل ضبط‌شده {playingId} · دسترسی به فایل در «لاگ تغییرات» ثبت می‌شود.
          </p>
        ) : null}

        <p className="mt-3 text-metadata text-text-secondary">
          خلاصه هر تماس (Wrap-up) هنگام بستن تعامل ثبت می‌شود؛ تماس‌های بدون خلاصه در گزارش سرپرست به‌عنوان ناتمام دیده می‌شوند.
        </p>
      </Panel>
    </div>
  );
}
