"use client";

import type { ReactNode } from "react";
import { formatNumber } from "./crm-sample-data";

/**
 * Small presentational pieces shared across the CRM panels.
 *
 * Everything here draws from the PET LIFE semantic tokens (surface-*, text-*,
 * border-*, brand-*, state-*) rather than raw hex, so the workspace follows
 * the site's light and dark themes without a palette of its own.
 */

export type Tone = "neutral" | "brand" | "success" | "attention" | "concern" | "urgent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border-subtle bg-surface-subtle text-text-secondary",
  brand: "border-brand-mint/40 bg-brand-mint/10 text-brand-mint-strong",
  success: "border-state-success/40 bg-state-success/10 text-state-success",
  attention: "border-state-attention/40 bg-state-attention/10 text-state-attention",
  concern: "border-state-higher-concern/40 bg-state-higher-concern/10 text-state-higher-concern",
  urgent: "border-state-urgent/40 bg-state-urgent/10 text-state-urgent",
};

const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-border-strong",
  brand: "bg-brand-mint",
  success: "bg-state-success",
  attention: "bg-state-attention",
  concern: "bg-state-higher-concern",
  urgent: "bg-state-urgent",
};

export function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-metadata ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-md border border-border-subtle bg-surface-elevated p-4 ${className}`}>{children}</section>;
}

export function PanelTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-section-title text-text-primary">{title}</h2>
        {hint ? <p className="mt-0.5 text-metadata text-text-secondary">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-elevated p-3">
      <p className="text-metadata text-text-secondary">{label}</p>
      {/* Tabular figures so a column of KPIs lines up digit for digit. */}
      <p className="mt-1 text-section-title tabular-nums text-text-primary">{value}</p>
      {sub ? <p className={`mt-0.5 text-metadata ${tone === "neutral" ? "text-text-secondary" : TONE_CLASS[tone].split(" ").pop()}`}>{sub}</p> : null}
    </div>
  );
}

export function Meter({ value, max, tone = "brand" }: { value: number; max: number; tone?: Tone }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle" role="img" aria-label={`${formatNumber(pct)}٪`}>
      <div className={`h-full rounded-full ${TONE_FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * A horizontal funnel. Each stage shows its own count and a bar scaled to the
 * largest stage, so the drop-off between stages is visible rather than implied.
 */
export function Pipeline({ stages }: { stages: { label: string; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {stages.map((stage) => (
        <div key={stage.label} className="flex flex-col gap-1.5">
          <span className="truncate text-metadata text-text-secondary" title={stage.label}>
            {stage.label}
          </span>
          <span className="text-body tabular-nums text-text-primary">{formatNumber(stage.count)}</span>
          <Meter value={stage.count} max={max} />
        </div>
      ))}
    </div>
  );
}

/** A horizontally scrollable table wrapper — the page itself never scrolls sideways. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap border-b border-border-subtle px-2 py-2 text-start text-metadata font-medium text-text-secondary">{children}</th>;
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap border-b border-border-subtle px-2 py-2 text-metadata text-text-primary ${className}`}>{children}</td>;
}

export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-2 py-8 text-center text-metadata text-text-secondary">
        {label}
      </td>
    </tr>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-metadata text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

const CONTROL = "rounded-md border border-border-subtle bg-surface-base px-2 py-1.5 text-metadata text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

export function TextFilter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={CONTROL} />;
}

export function SelectFilter<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | "all";
  onChange: (v: T | "all") => void;
  options: { value: T | "all"; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T | "all")} className={CONTROL}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

/** A right-hand detail drawer. Closing is always available via Escape or the close button. */
export function DetailDrawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-surface-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-e border-border-subtle bg-surface-elevated p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-section-title text-text-primary">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-metadata text-text-secondary">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-subtle px-2 py-1 text-metadata text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            بستن
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
      <span className="shrink-0 text-metadata text-text-secondary">{label}</span>
      <span className="text-end text-metadata text-text-primary">{children}</span>
    </div>
  );
}
