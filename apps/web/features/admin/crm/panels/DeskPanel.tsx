"use client";

import { useState } from "react";
import {
  AGENTS,
  CALLS,
  FOLLOW_UPS,
  HOUSEHOLDS,
  LEADS,
  LEAD_PIPELINE,
  LEAD_STAGE_LABEL,
  TICKETS,
  UPGRADES,
  agentName,
  dueLabel,
  formatIrr,
  formatNumber,
} from "../crm-sample-data";
import { Kpi, Panel, PanelTitle, Pipeline, Tag } from "../crm-ui";

/** کارتابل من — the landing view: what is mine, what is due, what is at risk. */
export function DeskPanel({ meId }: { meId: string }) {
  const [doneIds, setDoneIds] = useState<string[]>(FOLLOW_UPS.filter((f) => f.done).map((f) => f.id));

  const myLeads = LEADS.filter((l) => l.ownerId === meId && l.stage !== "lost" && l.stage !== "won");
  const myUpgrades = UPGRADES.filter((u) => u.ownerId === meId && u.stage !== "converted" && u.stage !== "declined");
  const myTickets = TICKETS.filter((t) => t.ownerId === meId && (t.status === "open" || t.status === "waiting"));
  const myFollowUps = FOLLOW_UPS.filter((f) => f.ownerId === meId);
  const pendingQa = CALLS.filter((c) => c.agentId === meId && c.qaStatus === "pending");

  const openPipelineValue = myLeads.reduce((sum, l) => sum + l.potentialMonthlyIrr, 0);
  const upgradeValue = myUpgrades.reduce((sum, u) => sum + u.monthlyIrr, 0);

  // Leads untouched for a week are the thing most likely to quietly die.
  const stale = myLeads.filter((l) => l.lastTouchDays >= 5);

  function toggle(id: string) {
    setDoneIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="لیدهای باز من" value={formatNumber(myLeads.length)} sub={`${formatNumber(stale.length)} بدون پیگیری`} tone={stale.length > 0 ? "attention" : "neutral"} />
        <Kpi label="ارزش ماهانه لیدها" value={formatIrr(openPipelineValue)} />
        <Kpi label="ارتقاهای در جریان" value={formatNumber(myUpgrades.length)} sub={formatIrr(upgradeValue)} tone="brand" />
        <Kpi label="تیکت‌های باز من" value={formatNumber(myTickets.length)} sub={pendingQa.length > 0 ? `${formatNumber(pendingQa.length)} تماس ارزیابی‌نشده` : undefined} tone={myTickets.length > 2 ? "concern" : "neutral"} />
      </div>

      <Panel>
        <PanelTitle title="قیف فروش من" hint="لیدهای در جریان به تفکیک مرحله" />
        <Pipeline stages={LEAD_PIPELINE.map((stage) => ({ label: LEAD_STAGE_LABEL[stage], count: LEADS.filter((l) => l.ownerId === meId && l.stage === stage).length }))} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title="پیگیری‌های من" hint="کارهایی که خودت ثبت کرده‌ای" />
          {myFollowUps.length === 0 ? (
            <p className="py-6 text-center text-metadata text-text-secondary">پیگیری بازی نداری.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {myFollowUps.map((f) => {
                const isDone = doneIds.includes(f.id);
                return (
                  <li key={f.id} className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                    <input
                      id={`followup-${f.id}`}
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggle(f.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-mint)]"
                    />
                    <label htmlFor={`followup-${f.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`text-metadata ${isDone ? "text-text-disabled line-through" : "text-text-primary"}`}>{f.title}</span>
                      <span className="text-metadata text-text-secondary">{f.linkedLabel}</span>
                    </label>
                    <Tag tone={f.dueInDays === 0 && !isDone ? "urgent" : "neutral"}>{dueLabel(f.dueInDays)}</Tag>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelTitle title="نیازمند توجه" hint="لیدهایی که پنج روز یا بیشتر بی‌پیگیری مانده‌اند" />
          {stale.length === 0 ? (
            <p className="py-6 text-center text-metadata text-text-secondary">همه لیدها به‌روز هستند.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stale.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-metadata text-text-primary">{l.name}</p>
                    <p className="text-metadata text-text-secondary">{LEAD_STAGE_LABEL[l.stage]} · امتیاز {formatNumber(l.score)}</p>
                  </div>
                  <Tag tone="attention">{formatNumber(l.lastTouchDays)} روز</Tag>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelTitle title="تیم" hint="بار کاری هر کارشناس" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a) => {
            const leads = LEADS.filter((l) => l.ownerId === a.id && l.stage !== "won" && l.stage !== "lost").length;
            const households = HOUSEHOLDS.filter((h) => h.ownerId === a.id).length;
            return (
              <div key={a.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-metadata text-text-primary">{a.name}</span>
                  {a.id === meId ? <Tag tone="brand">من</Tag> : null}
                </div>
                <p className="mt-1 text-metadata text-text-secondary">
                  {a.team === "acquisition" ? "جذب" : "موفقیت مشتری"} · {formatNumber(leads)} لید · {formatNumber(households)} خانوار
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-metadata text-text-secondary">کارشناس فعال: {agentName(meId)}</p>
      </Panel>
    </div>
  );
}
