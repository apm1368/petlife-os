"use client";

import { useState } from "react";
import { AGENTS, LEAD_SOURCES, LEAD_STAGE_LABEL, LOST_REASONS, UPGRADE_STAGE_LABEL, type LeadStage, type UpgradeStage, formatNumber } from "../crm-sample-data";
import { Panel, PanelTitle, Tag } from "../../console-ui";

type Tab = "pipeline" | "sources" | "team";

const TAB_LABEL: Record<Tab, string> = { pipeline: "مراحل فروش", sources: "منابع و دلایل", team: "تیم و دسترسی" };

/**
 * تنظیمات — the vocabulary the rest of the workspace is built from.
 *
 * Everything here is read-only in this build. The lists are rendered from the
 * same constants the panels use, so what is shown is genuinely what drives the
 * UI rather than a separate settings screen that could drift out of step.
 */
export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>("pipeline");

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

      {tab === "pipeline" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelTitle title="مراحل جذب ارائه‌دهنده" hint="ترتیب مراحل قیف فروش" />
            <ol className="flex flex-col gap-2">
              {(Object.keys(LEAD_STAGE_LABEL) as LeadStage[]).map((s, i) => (
                <li key={s} className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                  <span className="w-5 shrink-0 text-metadata tabular-nums text-text-secondary">{formatNumber(i + 1)}</span>
                  <span className="flex-1 text-metadata text-text-primary">{LEAD_STAGE_LABEL[s]}</span>
                  {s === "won" ? <Tag tone="success">پایان موفق</Tag> : s === "lost" ? <Tag tone="urgent">خارج از قیف</Tag> : null}
                </li>
              ))}
            </ol>
          </Panel>

          <Panel>
            <PanelTitle title="مراحل ارتقای اشتراک" hint="مسیر خانوار از شناسایی تا ارتقا" />
            <ol className="flex flex-col gap-2">
              {(Object.keys(UPGRADE_STAGE_LABEL) as UpgradeStage[]).map((s, i) => (
                <li key={s} className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                  <span className="w-5 shrink-0 text-metadata tabular-nums text-text-secondary">{formatNumber(i + 1)}</span>
                  <span className="flex-1 text-metadata text-text-primary">{UPGRADE_STAGE_LABEL[s]}</span>
                  {s === "converted" ? <Tag tone="success">پایان موفق</Tag> : s === "declined" ? <Tag tone="urgent">خارج از مسیر</Tag> : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      ) : null}

      {tab === "sources" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelTitle title="منابع لید" hint="کانال‌هایی که لید از آن‌ها می‌آید" />
            <ul className="flex flex-wrap gap-2">
              {LEAD_SOURCES.map((s) => (
                <li key={s}>
                  <Tag tone="brand">{s}</Tag>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelTitle title="دلایل از دست رفتن" hint="برای تحلیل ریزش در گزارشات" />
            <ul className="flex flex-wrap gap-2">
              {LOST_REASONS.map((r) => (
                <li key={r}>
                  <Tag tone="urgent">{r}</Tag>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "team" ? (
        <Panel>
          <PanelTitle title="کارشناسان" hint="دو تیم: جذب ارائه‌دهنده و موفقیت مشتری" />
          <ul className="flex flex-col gap-2">
            {AGENTS.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                <span className="text-metadata text-text-primary">{a.name}</span>
                <div className="flex flex-wrap gap-2">
                  <Tag tone={a.team === "acquisition" ? "brand" : "success"}>{a.team === "acquisition" ? "تیم جذب" : "تیم موفقیت مشتری"}</Tag>
                  {a.role === "lead" ? <Tag tone="attention">سرپرست</Tag> : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-metadata text-text-secondary">
            دسترسی این کارشناسان از نقش‌های ادمین پت لایف می‌آید و اینجا تعریف نمی‌شود — تا یک منبع حقیقت برای مجوزها باقی بماند.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
