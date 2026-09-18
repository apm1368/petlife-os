"use client";

import { useState } from "react";
import {
  CA_AGENTS,
  CA_CALLS,
  CA_ESCALATIONS,
  CA_FOLLOW_UPS,
  CA_TICKETS,
  OPEN_TICKET_STATUSES,
  slaState,
} from "./ca-sample-data";
import { formatNumber } from "../console-ui";
import { CallsPanel } from "./panels/CallsPanel";
import { CasesPanel } from "./panels/CasesPanel";
import { ChangeLogPanel } from "./panels/ChangeLogPanel";
import { CustomersPanel } from "./panels/CustomersPanel";
import { DashboardPanel } from "./panels/DashboardPanel";
import { InboxPanel } from "./panels/InboxPanel";
import { QualityPanel } from "./panels/QualityPanel";
import { ReportsPanel } from "./panels/ReportsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { SmsPanel } from "./panels/SmsPanel";

type Section = "dashboard" | "inbox" | "customers" | "cases" | "calls" | "quality" | "sms" | "reports" | "settings" | "log";

const SECTION_LABEL: Record<Section, string> = {
  dashboard: "داشبورد",
  inbox: "اینباکس",
  customers: "مشتریان",
  cases: "پرونده‌ها",
  calls: "تماس‌ها",
  quality: "کنترل کیفیت",
  sms: "پیامک",
  reports: "گزارش‌ها",
  settings: "تنظیمات",
  log: "لاگ تغییرات",
};

const SECTION_HINT: Record<Section, string> = {
  dashboard: "سه نما: میز کار من، سرپرست مرکز تماس و کیفیت",
  inbox: "تیکت، پیگیری و ارجاع در یک صف — مرتب بر اساس نزدیک‌ترین مهلت",
  customers: "پرونده ۳۶۰ هر خانوار، با تایم‌لاین و لاگ تجربه مشتری",
  cases: "تیکت، پیگیری، شکایت و ارجاع — همه در یک قالب",
  calls: "آرشیو تماس‌ها با فایل ضبط و وضعیت ارزیابی",
  quality: "صف ارزیابی، ارزیابی‌های ثبت‌شده، کارنامه و اسکورکارت",
  sms: "پترن‌های ثابت و پویا، ارسال دستی یا خودکار",
  reports: "پایبندی SLA، دلایل تماس، علت ریشه‌ای و رضایت",
  settings: "واژگانی که بقیه بخش‌ها از آن تغذیه می‌شوند",
  log: "چه کسی چه چیزی را تغییر داد، و مقدار قبلی چه بود",
};

/**
 * امور مشتریان پت لایف — the customer-care operations console.
 *
 * Three deliberate boundaries:
 *
 *  1. No business-line concept. PET LIFE is one product, so the lineId the
 *     reference prototype threaded through every filter and report is absent
 *     rather than defaulted to a value nobody can change.
 *
 *  2. It is not the CRM. The CRM at /admin/crm is revenue-facing — leads,
 *     upgrades, pipeline. This console is service-facing: SLA, ticket
 *     lifecycle, call quality, complaints. Where they touch the same record
 *     the CRM stays the shallow read and this is the place work is done.
 *
 *  3. It does not redefine admin permissions. Roles are listed in «تنظیمات»
 *     as context; the access boundary stays in the admin role system.
 *
 * Every figure comes from `ca-sample-data.ts`. There is no backend for this
 * domain yet, and the banner below says so on screen.
 */
export function CustomerAffairsWorkspace() {
  const [section, setSection] = useState<Section>("dashboard");
  // Fixed until the console has real accounts behind it; switching re-scopes
  // the personal views so each role's screen can actually be checked.
  const [meId, setMeId] = useState<string>(CA_AGENTS[0].id);

  const openTickets = CA_TICKETS.filter((t) => OPEN_TICKET_STATUSES.includes(t.status));
  const counts: Partial<Record<Section, number>> = {
    inbox: openTickets.length + CA_FOLLOW_UPS.filter((f) => !f.done).length + CA_ESCALATIONS.filter((e) => e.status !== "done").length,
    cases: openTickets.length,
    quality: CA_CALLS.filter((c) => c.hasRecording && !c.evaluated).length,
  };
  const breached = openTickets.filter((t) => slaState(t) === "breached").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-text-primary">امور مشتریان پت لایف</h1>
          <p className="mt-0.5 text-metadata text-text-secondary">{SECTION_HINT[section]}</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-metadata text-text-secondary">کاربر فعال</span>
          <select
            id="ca-active-agent"
            value={meId}
            onChange={(e) => setMeId(e.target.value)}
            className="rounded-md border border-border-subtle bg-surface-base px-2 py-1.5 text-metadata text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {CA_AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="rounded-md border border-state-attention/40 bg-state-attention/10 px-3 py-2 text-metadata text-state-attention">
        داده‌های این بخش نمونه و ساختگی است و به API متصل نیست. هیچ عددی اینجا واقعی نیست و چیزی ذخیره نمی‌شود.
      </p>

      {breached > 0 ? (
        <p className="rounded-md border border-state-urgent/40 bg-state-urgent/10 px-3 py-2 text-metadata text-state-urgent">
          {formatNumber(breached)} تیکت از مهلت پاسخ گذشته است.
        </p>
      ) : null}

      <nav aria-label="بخش‌های امور مشتریان" className="flex gap-1 overflow-x-auto border-b border-border-subtle pb-1.5">
        {(Object.keys(SECTION_LABEL) as Section[]).map((s) => {
          const count = counts[s];
          const isActive = section === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              aria-current={isActive ? "page" : undefined}
              className={
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-metadata outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
                (isActive ? "bg-surface-subtle text-text-primary" : "text-text-secondary hover:bg-surface-subtle")
              }
            >
              {SECTION_LABEL[s]}
              {count !== undefined && count > 0 ? (
                <span className="rounded-full bg-border-subtle px-1.5 text-metadata tabular-nums text-text-secondary">{formatNumber(count)}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {section === "dashboard" ? <DashboardPanel meId={meId} /> : null}
      {section === "inbox" ? <InboxPanel meId={meId} /> : null}
      {section === "customers" ? <CustomersPanel /> : null}
      {section === "cases" ? <CasesPanel /> : null}
      {section === "calls" ? <CallsPanel /> : null}
      {section === "quality" ? <QualityPanel /> : null}
      {section === "sms" ? <SmsPanel /> : null}
      {section === "reports" ? <ReportsPanel meId={meId} /> : null}
      {section === "settings" ? <SettingsPanel /> : null}
      {section === "log" ? <ChangeLogPanel /> : null}
    </div>
  );
}
