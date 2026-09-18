"use client";

import { useState } from "react";
import { AGENTS, CALLS, LEADS, TICKETS, UPGRADES, formatNumber } from "./crm-sample-data";
import { CallsPanel } from "./panels/CallsPanel";
import { DeskPanel } from "./panels/DeskPanel";
import { HouseholdsPanel } from "./panels/HouseholdsPanel";
import { LeadsPanel } from "./panels/LeadsPanel";
import { ReportsPanel } from "./panels/ReportsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { TicketsPanel } from "./panels/TicketsPanel";
import { UpgradesPanel } from "./panels/UpgradesPanel";

type Section = "desk" | "leads" | "upgrades" | "households" | "tickets" | "calls" | "reports" | "settings";

const SECTION_LABEL: Record<Section, string> = {
  desk: "کارتابل من",
  leads: "لیدها",
  upgrades: "ارتقای اشتراک",
  households: "خانوارها",
  tickets: "تیکت‌ها",
  calls: "مرکز تماس",
  reports: "گزارشات",
  settings: "تنظیمات",
};

const SECTION_HINT: Record<Section, string> = {
  desk: "کارها و پرونده‌های خودت",
  leads: "جذب کلینیک، پت‌شاپ، آرایشگاه و پانسیون",
  upgrades: "خانوارهایی که از پلن فعلی‌شان فراتر رفته‌اند",
  households: "مشتری پت لایف یک خانوار است، نه یک نفر",
  tickets: "بار پشتیبانی روی هر رابطه",
  calls: "گزارش تماس‌ها و ارزیابی کیفیت",
  reports: "روند شش ماه گذشته و اثربخشی کانال‌ها",
  settings: "واژگانی که بقیه بخش‌ها از آن ساخته شده‌اند",
};

/**
 * CRM پت لایف — a sales and customer-success workspace inside the admin panel.
 *
 * Two deliberate boundaries:
 *
 *  1. No business-line concept. PET LIFE is one product, so the `lineId`
 *     dimension the reference CRM carried through every filter, report and
 *     permission check is simply absent rather than defaulted to a single
 *     value nobody can change.
 *
 *  2. It does not restate what the admin panel already owns. Tickets here are
 *     read-only context; a case is still worked in «پشتیبانی», subscriptions
 *     are still administered in «اشتراک‌ها». The CRM adds the layer those
 *     screens lack — who is chasing what, and why.
 *
 * Every figure comes from `crm-sample-data.ts`. There is no CRM API yet, and
 * the banner below says so on screen so a number here is never mistaken for
 * a real one.
 */
export function CrmWorkspace() {
  const [section, setSection] = useState<Section>("desk");
  // The signed-in agent is fixed until the CRM has real accounts behind it.
  const [meId, setMeId] = useState<string>(AGENTS[0].id);

  const counts: Partial<Record<Section, number>> = {
    leads: LEADS.filter((l) => l.stage !== "won" && l.stage !== "lost").length,
    upgrades: UPGRADES.filter((u) => u.stage !== "converted" && u.stage !== "declined").length,
    tickets: TICKETS.filter((t) => t.status === "open" || t.status === "waiting").length,
    calls: CALLS.filter((c) => c.qaStatus === "pending").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-text-primary">CRM پت لایف</h1>
          <p className="mt-0.5 text-metadata text-text-secondary">{SECTION_HINT[section]}</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-metadata text-text-secondary">کارشناس فعال</span>
          <select
            id="crm-active-agent"
            value={meId}
            onChange={(e) => setMeId(e.target.value)}
            className="rounded-md border border-border-subtle bg-surface-base px-2 py-1.5 text-metadata text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {AGENTS.map((a) => (
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

      <nav aria-label="بخش‌های CRM" className="flex gap-1 overflow-x-auto border-b border-border-subtle pb-1.5">
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

      {section === "desk" ? <DeskPanel meId={meId} /> : null}
      {section === "leads" ? <LeadsPanel /> : null}
      {section === "upgrades" ? <UpgradesPanel /> : null}
      {section === "households" ? <HouseholdsPanel /> : null}
      {section === "tickets" ? <TicketsPanel /> : null}
      {section === "calls" ? <CallsPanel /> : null}
      {section === "reports" ? <ReportsPanel /> : null}
      {section === "settings" ? <SettingsPanel /> : null}
    </div>
  );
}
