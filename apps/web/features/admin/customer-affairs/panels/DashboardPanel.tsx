"use client";

import { useState } from "react";
import {
  CA_AGENTS,
  CA_CALLS,
  CA_COMPLAINTS,
  CA_ESCALATIONS,
  CA_EVALUATIONS,
  CA_FOLLOW_UPS,
  CA_SURVEYS,
  CA_TICKETS,
  OPEN_TICKET_STATUSES,
  PRIORITY_LABEL,
  SLA_STATE_LABEL,
  TICKET_STATUS_LABEL,
  caAgentName,
  caCustomerName,
  dueInLabel,
  formatMinutes,
  slaState,
  surveyAverage,
} from "../ca-sample-data";
import { Kpi, Meter, Panel, PanelTitle, Tag, formatNumber } from "../../console-ui";

type View = "me" | "supervisor" | "quality";

const VIEW_LABEL: Record<View, string> = { me: "میز کار من", supervisor: "داشبورد سرپرست", quality: "داشبورد کیفیت" };

const SLA_TONE = { breached: "urgent", at_risk: "attention", on_time: "success", done: "neutral" } as const;

/**
 * داشبورد — three different jobs, so three views rather than one screen that
 * serves none of them well: an agent needs their own queue, a supervisor needs
 * the floor, and QA needs the evaluation backlog.
 */
export function DashboardPanel({ meId }: { meId: string }) {
  const [view, setView] = useState<View>("me");

  const openTickets = CA_TICKETS.filter((t) => OPEN_TICKET_STATUSES.includes(t.status));
  const breached = openTickets.filter((t) => slaState(t) === "breached");
  const atRisk = openTickets.filter((t) => slaState(t) === "at_risk");
  const unassigned = openTickets.filter((t) => t.ownerId === null);
  const pendingQa = CA_CALLS.filter((c) => c.hasRecording && !c.evaluated);

  const myTickets = openTickets.filter((t) => t.ownerId === meId);
  const myFollowUps = CA_FOLLOW_UPS.filter((f) => f.ownerId === meId && !f.done);
  const myOverdue = myFollowUps.filter((f) => f.dueInHours < 0);
  const myCalls = CA_CALLS.filter((c) => c.agentId === meId);

  const todayCalls = CA_CALLS.filter((c) => c.daysAgo === 0);
  const answered = CA_CALLS.filter((c) => c.talkSeconds > 0);
  const avgTalk = answered.length === 0 ? 0 : Math.round(answered.reduce((s, c) => s + c.talkSeconds, 0) / answered.length);
  const avgWait = CA_CALLS.length === 0 ? 0 : Math.round(CA_CALLS.reduce((s, c) => s + c.waitSeconds, 0) / CA_CALLS.length);
  const avgCsat = CA_SURVEYS.length === 0 ? 0 : Math.round((CA_SURVEYS.reduce((s, v) => s + surveyAverage(v), 0) / CA_SURVEYS.length) * 10) / 10;
  const avgQa = CA_EVALUATIONS.length === 0 ? 0 : Math.round(CA_EVALUATIONS.reduce((s, e) => s + e.score, 0) / CA_EVALUATIONS.length);

  // SLA adherence across every ticket that has left the open states.
  const finished = CA_TICKETS.filter((t) => !OPEN_TICKET_STATUSES.includes(t.status));
  const adherence = CA_TICKETS.length === 0 ? 0 : Math.round(((CA_TICKETS.length - breached.length) / CA_TICKETS.length) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={
              "rounded-full border px-3 py-1 text-metadata outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
              (view === v ? "border-brand-mint bg-brand-mint/10 text-brand-mint-strong" : "border-border-subtle text-text-secondary hover:bg-surface-subtle")
            }
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {view === "me" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="تیکت‌های باز من" value={formatNumber(myTickets.length)} />
            <Kpi label="پیگیری‌های من" value={formatNumber(myFollowUps.length)} sub={myOverdue.length > 0 ? `${formatNumber(myOverdue.length)} عقب‌افتاده` : undefined} tone={myOverdue.length > 0 ? "urgent" : "neutral"} />
            <Kpi label="تماس‌های من" value={formatNumber(myCalls.length)} sub={`میانگین ${formatMinutes(avgTalk)}`} />
            <Kpi label="نقض مهلت در تیکت‌های من" value={formatNumber(myTickets.filter((t) => slaState(t) === "breached").length)} tone="urgent" />
          </div>

          <Panel>
            <PanelTitle title="تیکت‌های من" hint="مرتب بر اساس نزدیک‌ترین مهلت" />
            {myTickets.length === 0 ? (
              <p className="py-6 text-center text-metadata text-text-secondary">تیکت بازی به شما تخصیص نیافته.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...myTickets]
                  .sort((a, b) => a.slaRemainingHours - b.slaRemainingHours)
                  .map((t) => {
                    const state = slaState(t);
                    return (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-metadata text-text-primary">{t.title}</p>
                          <p className="text-metadata text-text-secondary">
                            {t.id} · {caCustomerName(t.customerId)} · {TICKET_STATUS_LABEL[t.status]}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Tag tone={t.priority === "critical" ? "urgent" : t.priority === "high" ? "attention" : "neutral"}>{PRIORITY_LABEL[t.priority]}</Tag>
                          <Tag tone={SLA_TONE[state]}>{SLA_STATE_LABEL[state]}</Tag>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelTitle title="پیگیری‌های من" hint="تعهدات زمان‌دار به مشتری" />
            {myFollowUps.length === 0 ? (
              <p className="py-6 text-center text-metadata text-text-secondary">پیگیری بازی ندارید.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {myFollowUps.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-metadata text-text-primary">{f.title}</p>
                      <p className="text-metadata text-text-secondary">{caCustomerName(f.customerId)}</p>
                    </div>
                    <Tag tone={f.dueInHours < 0 ? "urgent" : f.dueInHours <= 4 ? "attention" : "neutral"}>{dueInLabel(f.dueInHours)}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {view === "supervisor" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="تیکت‌های باز" value={formatNumber(openTickets.length)} sub={`${formatNumber(unassigned.length)} تخصیص‌نیافته`} tone={unassigned.length > 0 ? "attention" : "neutral"} />
            <Kpi label="نقض مهلت" value={formatNumber(breached.length)} sub={`${formatNumber(atRisk.length)} در معرض نقض`} tone={breached.length > 0 ? "urgent" : "success"} />
            <Kpi label="پایبندی SLA" value={`${formatNumber(adherence)}٪`} tone={adherence >= 90 ? "success" : adherence >= 70 ? "attention" : "urgent"} />
            <Kpi label="تماس امروز" value={formatNumber(todayCalls.length)} sub={`میانگین انتظار ${formatNumber(avgWait)} ثانیه`} />
          </div>

          <Panel>
            <PanelTitle title="بار کاری کارشناسان" hint="تیکت باز و پیگیری هر نفر" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CA_AGENTS.filter((a) => a.role === "agent" || a.role === "supervisor").map((a) => {
                const tickets = openTickets.filter((t) => t.ownerId === a.id);
                const overdue = tickets.filter((t) => slaState(t) === "breached").length;
                const follows = CA_FOLLOW_UPS.filter((f) => f.ownerId === a.id && !f.done).length;
                return (
                  <div key={a.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-metadata text-text-primary">{a.name}</span>
                      <span className="shrink-0 text-metadata text-text-secondary">داخلی {a.extension}</span>
                    </div>
                    <p className="mt-1 text-metadata text-text-secondary">
                      {formatNumber(tickets.length)} تیکت باز · {formatNumber(follows)} پیگیری
                      {overdue > 0 ? ` · ${formatNumber(overdue)} نقض مهلت` : ""}
                    </p>
                    <div className="mt-1.5">
                      <Meter value={tickets.length} max={Math.max(1, openTickets.length)} tone={overdue > 0 ? "urgent" : "brand"} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <PanelTitle title="نیازمند تخصیص" hint="تیکت‌هایی که هنوز مسئول ندارند" />
            {unassigned.length === 0 ? (
              <p className="py-6 text-center text-metadata text-text-secondary">همه تیکت‌ها تخصیص یافته‌اند.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {unassigned.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-state-attention/40 bg-state-attention/10 px-2.5 py-2">
                    <span className="min-w-0 truncate text-metadata text-text-primary">{t.title}</span>
                    <Tag tone="attention">{dueInLabel(t.slaRemainingHours)}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {view === "quality" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="در صف ارزیابی" value={formatNumber(pendingQa.length)} tone={pendingQa.length > 3 ? "attention" : "neutral"} />
            <Kpi label="ارزیابی‌های ثبت‌شده" value={formatNumber(CA_EVALUATIONS.length)} />
            <Kpi label="میانگین امتیاز کیفیت" value={formatNumber(avgQa)} sub="از ۱۰۰" tone={avgQa >= 85 ? "success" : avgQa >= 70 ? "attention" : "urgent"} />
            <Kpi label="رضایت مشتری" value={`${formatNumber(avgCsat)} از ۵`} tone={avgCsat >= 4 ? "success" : avgCsat >= 3 ? "attention" : "urgent"} />
          </div>

          <Panel>
            <PanelTitle title="کارنامه کارشناسان" hint="میانگین امتیاز ارزیابی ثبت‌شده" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CA_AGENTS.filter((a) => a.role === "agent").map((a) => {
                const evals = CA_EVALUATIONS.filter((e) => e.agentId === a.id);
                const avg = evals.length === 0 ? null : Math.round(evals.reduce((s, e) => s + e.score, 0) / evals.length);
                const critical = evals.filter((e) => e.criticalError !== null).length;
                return (
                  <div key={a.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-metadata text-text-primary">{a.name}</span>
                      {avg === null ? <Tag tone="neutral">بدون ارزیابی</Tag> : <Tag tone={avg >= 85 ? "success" : avg >= 70 ? "attention" : "urgent"}>{formatNumber(avg)}</Tag>}
                    </div>
                    <p className="mt-1 text-metadata text-text-secondary">
                      {formatNumber(evals.length)} ارزیابی
                      {critical > 0 ? ` · ${formatNumber(critical)} خطای بحرانی` : ""}
                    </p>
                    {avg === null ? null : <div className="mt-1.5"><Meter value={avg} max={100} tone={avg >= 85 ? "success" : avg >= 70 ? "attention" : "urgent"} /></div>}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <PanelTitle title="شکایات باز" hint="ورودی مستقیم چرخه بهبود" />
            <ul className="flex flex-col gap-2">
              {CA_COMPLAINTS.filter((c) => c.status !== "closed").map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-metadata text-text-primary">{c.summary}</p>
                    <p className="text-metadata text-text-secondary">{caCustomerName(c.customerId)} · علیه {c.againstLabel}</p>
                  </div>
                  <Tag tone={c.severity === "high" || c.severity === "critical" ? "urgent" : "attention"}>{PRIORITY_LABEL[c.severity]}</Tag>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}

      <p className="text-metadata text-text-secondary">
        ارجاعات باز: {formatNumber(CA_ESCALATIONS.filter((e) => e.status !== "done").length)} · تیکت‌های پایان‌یافته: {formatNumber(finished.length)} · کارشناس فعال: {caAgentName(meId)}
      </p>
    </div>
  );
}
