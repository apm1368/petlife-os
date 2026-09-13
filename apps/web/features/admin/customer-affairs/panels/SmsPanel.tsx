"use client";

import { useState } from "react";
import { CA_CUSTOMERS, SMS_PATTERNS, SMS_TRIGGER_LABEL, SMS_VARIABLES, caCustomerName, type SmsPattern } from "../ca-sample-data";
import { Kpi, Panel, PanelTitle, Tag, formatNumber } from "../../console-ui";

/** SMS is billed per 70-character part, so the length matters operationally. */
const SMS_PART_LENGTH = 70;

/** پیامک و پترن‌ها — fixed and dynamic templates, sent by hand or on an event. */
export function SmsPanel() {
  const [autoSend, setAutoSend] = useState<Record<string, boolean>>(() => Object.fromEntries(SMS_PATTERNS.map((p) => [p.id, p.autoSend])));
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string>(SMS_PATTERNS[0].id);

  const preview: SmsPattern = SMS_PATTERNS.find((p) => p.id === previewId) ?? SMS_PATTERNS[0];
  const parts = Math.max(1, Math.ceil(preview.body.length / SMS_PART_LENGTH));
  const activeAuto = Object.values(autoSend).filter(Boolean).length;

  function toggleCustomer(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="پترن‌ها" value={formatNumber(SMS_PATTERNS.length)} />
        <Kpi label="ارسال خودکار فعال" value={formatNumber(activeAuto)} tone="brand" />
        <Kpi label="پترن پویا" value={formatNumber(SMS_PATTERNS.filter((p) => p.isDynamic).length)} sub="دارای متغیر" />
        <Kpi label="گیرندگان انتخاب‌شده" value={formatNumber(selected.length)} tone={selected.length > 0 ? "attention" : "neutral"} />
      </div>

      <Panel>
        <PanelTitle title="پترن‌های پیامک" hint="ثابت یا پویا · ارسال دستی یا خودکار روی رویداد" />
        <div className="flex flex-col gap-2">
          {SMS_PATTERNS.map((p) => (
            <article key={p.id} className="rounded-md border border-border-subtle bg-surface-subtle p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-metadata text-text-primary">{p.title}</p>
                  <p className="mt-0.5 text-metadata text-text-secondary">{SMS_TRIGGER_LABEL[p.trigger]}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Tag tone={p.isDynamic ? "brand" : "neutral"}>{p.isDynamic ? "پویا" : "ثابت"}</Tag>
                  <label className="flex items-center gap-1.5">
                    <input
                      id={`auto-${p.id}`}
                      type="checkbox"
                      checked={autoSend[p.id] ?? false}
                      onChange={() => setAutoSend((c) => ({ ...c, [p.id]: !c[p.id] }))}
                      className="h-4 w-4 accent-[var(--brand-mint)]"
                    />
                    <span className="text-metadata text-text-secondary">ارسال خودکار</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPreviewId(p.id)}
                    className="rounded-md border border-border-subtle px-2 py-0.5 text-metadata text-text-primary outline-none hover:bg-surface-base focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    پیش‌نمایش
                  </button>
                </div>
              </div>
              <p className="mt-2 rounded-md border border-border-subtle bg-surface-base p-2.5 text-metadata leading-relaxed text-text-primary">{p.body}</p>
            </article>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title="پیش‌نمایش" hint={preview.title} />
          <p className="rounded-md border border-border-subtle bg-surface-subtle p-3 text-metadata leading-relaxed text-text-primary">{preview.body}</p>
          <p className="mt-2 text-metadata text-text-secondary">
            {formatNumber(preview.body.length)} کاراکتر · {formatNumber(parts)} بخش پیامک
          </p>
          {preview.isDynamic ? (
            <>
              <p className="mt-3 mb-1.5 text-metadata text-text-secondary">متغیرهای قابل استفاده</p>
              <ul className="flex flex-wrap gap-2">
                {SMS_VARIABLES.map((v) => (
                  <li key={v}>
                    <Tag tone="brand">{v}</Tag>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>

        <Panel>
          <PanelTitle
            title="گیرندگان"
            hint={`${formatNumber(selected.length)} از ${formatNumber(CA_CUSTOMERS.length)} مشتری انتخاب شده`}
            action={
              <button
                type="button"
                onClick={() => setSelected(selected.length === CA_CUSTOMERS.length ? [] : CA_CUSTOMERS.map((c) => c.id))}
                className="rounded-md border border-border-subtle px-2.5 py-1 text-metadata text-text-primary outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {selected.length === CA_CUSTOMERS.length ? "لغو انتخاب همه" : "انتخاب همه"}
              </button>
            }
          />
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {CA_CUSTOMERS.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                  <input
                    id={`sms-to-${c.id}`}
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggleCustomer(c.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--brand-mint)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-metadata text-text-primary">{c.name}</span>
                  <span className="shrink-0 text-metadata tabular-nums text-text-secondary">{c.phone}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-metadata text-text-secondary">
            {selected.length === 0
              ? "برای ارسال، دست‌کم یک گیرنده انتخاب کنید."
              : `گیرندگان: ${selected.slice(0, 3).map(caCustomerName).join("، ")}${selected.length > 3 ? " و ..." : ""}`}
          </p>
        </Panel>
      </div>
    </div>
  );
}
