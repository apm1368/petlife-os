"use client";

import { useState } from "react";
import {
  AGENT_ROLE_LABEL,
  CA_AGENTS,
  CONTACT_REASONS,
  PRIORITY_LABEL,
  RESOLUTION_LABEL,
  ROOT_CAUSE_LABEL,
  SLA_HOURS,
  SMS_TRIGGER_LABEL,
  SMS_PATTERNS,
  type Priority,
  type Resolution,
  type RootCause,
} from "../ca-sample-data";
import { Panel, PanelTitle, TableWrap, Tag, Td, Th, formatNumber } from "../../console-ui";

type Tab = "sla" | "reasons" | "outcomes" | "templates" | "roles";

const TAB_LABEL: Record<Tab, string> = {
  sla: "مهلت‌ها",
  reasons: "دلایل تماس",
  outcomes: "نتایج و علل",
  templates: "قالب‌ها",
  roles: "نقش و دسترسی",
};

/**
 * تنظیمات — the vocabulary every other panel is built from.
 *
 * Read-only in this build, and rendered straight from the same constants the
 * console filters and scores by, so what is shown here is genuinely in force
 * rather than a documentation page that can quietly drift.
 */
export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>("sla");

  return (
    <div className="flex flex-col gap-4">
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

      {tab === "sla" ? (
        <Panel>
          <PanelTitle title="مهلت پاسخ بر اساس اولویت" hint="سررسید تیکت‌های جدید بلافاصله از همین مقادیر محاسبه می‌شود" />
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>اولویت</Th>
                  <Th>مهلت</Th>
                  <Th>آستانه هشدار</Th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <tr key={p}>
                    <Td>
                      <Tag tone={p === "critical" ? "urgent" : p === "high" ? "attention" : p === "normal" ? "brand" : "neutral"}>{PRIORITY_LABEL[p]}</Tag>
                    </Td>
                    <Td className="tabular-nums">{formatNumber(SLA_HOURS[p])} ساعت</Td>
                    <Td className="tabular-nums text-text-secondary">{formatNumber(Math.round(SLA_HOURS[p] / 4))} ساعت مانده</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-3 text-metadata text-text-secondary">
            تیکت وقتی «در معرض نقض» علامت می‌خورد که کمتر از یک‌چهارم مهلتش باقی مانده باشد.
          </p>
        </Panel>
      ) : null}

      {tab === "reasons" ? (
        <Panel>
          <PanelTitle title="درخت دلایل تماس" hint="همه دراپ‌داون‌های دسته‌بندی از این‌جا تغذیه می‌شوند" />
          <div className="flex flex-col gap-3">
            {CONTACT_REASONS.map((r) => (
              <div key={r.key} className="rounded-md border border-border-subtle bg-surface-subtle p-3">
                <p className="text-metadata text-text-primary">{r.label}</p>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {r.children.map((c) => (
                    <li key={c}>
                      <Tag tone="neutral">{c}</Tag>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {tab === "outcomes" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelTitle title="نوع رفع" hint="هنگام بستن تیکت انتخاب می‌شود" />
            <ul className="flex flex-wrap gap-2">
              {(Object.keys(RESOLUTION_LABEL) as Resolution[]).map((r) => (
                <li key={r}>
                  <Tag tone="brand">{RESOLUTION_LABEL[r]}</Tag>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelTitle title="علت ریشه‌ای" hint="ورودی تحلیل بهبود فرآیند" />
            <ul className="flex flex-wrap gap-2">
              {(Object.keys(ROOT_CAUSE_LABEL) as RootCause[]).map((r) => (
                <li key={r}>
                  <Tag tone={r === "agent_error" || r === "process_error" ? "attention" : "neutral"}>{ROOT_CAUSE_LABEL[r]}</Tag>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "templates" ? (
        <Panel>
          <PanelTitle title="قالب‌های پیامک" hint="رویدادی که هر قالب روی آن ارسال می‌شود" />
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>قالب</Th>
                  <Th>نوع</Th>
                  <Th>رویداد ارسال</Th>
                </tr>
              </thead>
              <tbody>
                {SMS_PATTERNS.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.title}</Td>
                    <Td>
                      <Tag tone={p.isDynamic ? "brand" : "neutral"}>{p.isDynamic ? "پویا" : "ثابت"}</Tag>
                    </Td>
                    <Td className="text-text-secondary">{SMS_TRIGGER_LABEL[p.trigger]}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}

      {tab === "roles" ? (
        <Panel>
          <PanelTitle title="نقش‌ها" hint="دسترسی واقعی از نقش‌های ادمین پت لایف می‌آید، نه از این صفحه" />
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>نام</Th>
                  <Th>نقش</Th>
                  <Th>داخلی</Th>
                </tr>
              </thead>
              <tbody>
                {CA_AGENTS.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.name}</Td>
                    <Td className="text-text-secondary">{AGENT_ROLE_LABEL[a.role]}</Td>
                    <Td className="tabular-nums text-text-secondary">{a.extension}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-3 text-metadata text-text-secondary">
            مجوزها اینجا بازتعریف نمی‌شوند تا یک منبع حقیقت برای دسترسی باقی بماند.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
