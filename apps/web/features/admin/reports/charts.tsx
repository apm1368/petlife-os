"use client";

import { useId, useMemo, useState } from "react";

/**
 * The ERP chart kit: plain SVG, no chart library. Every chart scales with its container (viewBox), reads its
 * colours from the --chart-* tokens so it follows light/dark, and keeps the time axis left-to-right in every
 * locale (the convention Persian dashboards use too). Each chart also carries a text summary for screen readers.
 */

export type Series = { key: string; label: string; color: string; values: number[]; area?: boolean };

const W = 720;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 52 };

function niceMax(value: number) {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function TrendChart({
  labels,
  series,
  formatValue,
  formatLabel,
  ariaLabel,
  height = H,
}: {
  labels: string[];
  series: Series[];
  formatValue: (value: number) => string;
  formatLabel: (label: string) => string;
  ariaLabel: string;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => niceMax(Math.max(0, ...series.flatMap((s) => s.values))), [series]);
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const count = Math.max(labels.length, 1);
  const x = (i: number) => PAD.left + (count === 1 ? innerW / 2 : (i / (count - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(count / 8));
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
  };
  const summary = series.map((s) => `${s.label}: ${formatValue(s.values.reduce((a, b) => a + b, 0))}`).join("، ");
  return (
    <div className="gx-chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${ariaLabel}. ${summary}`}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">{formatValue(tick)}</text>
          </g>
        ))}
        {labels.map((label, i) => (i % labelEvery === 0 || i === count - 1 ? (
          <text key={label} x={x(i)} y={height - 8} textAnchor="middle">{formatLabel(label)}</text>
        ) : null))}
        {series.map((s) => (
          <g key={s.key}>
            {s.area !== false && s.values.length > 1 ? (
              <path d={`${path(s.values)}L${x(s.values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${id}-${s.key})`} />
            ) : null}
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            {s.values.length === 1 ? <circle cx={x(0)} cy={y(s.values[0] ?? 0)} r="4" fill={s.color} /> : null}
          </g>
        ))}
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--chart-grid)" strokeWidth="2" />
            {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4.5" fill={s.color} stroke="var(--glass-solid)" strokeWidth="2" />)}
          </g>
        ) : null}
        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && labels[hover] ? (
        <div className="gx-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(PAD.top / height) * 100}%` }}>
          <b>{formatLabel(labels[hover]!)}</b>
          {series.map((s) => <div key={s.key}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginInlineEnd: 6 }} />{s.label}: {formatValue(s.values[hover] ?? 0)}</div>)}
        </div>
      ) : null}
      <div className="gx-legend">
        {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}

/** Grouped columns for two to three measures per bucket. */
export function ColumnChart({ labels, series, formatValue, formatLabel, ariaLabel }: { labels: string[]; series: Series[]; formatValue: (v: number) => string; formatLabel: (l: string) => string; ariaLabel: string }) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const count = Math.max(labels.length, 1);
  const band = innerW / count;
  const barW = Math.max(2, Math.min(22, (band * 0.75) / series.length));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const labelEvery = Math.max(1, Math.ceil(count / 8));
  return (
    <div className="gx-chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(f * max)} y2={y(f * max)} stroke="var(--chart-grid)" />
            <text x={PAD.left - 8} y={y(f * max) + 4} textAnchor="end">{formatValue(f * max)}</text>
          </g>
        ))}
        {labels.map((label, i) => {
          const cx = PAD.left + band * i + band / 2;
          return (
            <g key={label}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const bx = cx - (barW * series.length) / 2 + si * barW;
                return <rect key={s.key} x={bx} y={y(v)} width={barW - 2} height={Math.max(0, PAD.top + innerH - y(v))} rx="3" fill={s.color}><title>{`${formatLabel(label)} · ${s.label}: ${formatValue(v)}`}</title></rect>;
              })}
              {i % labelEvery === 0 ? <text x={cx} y={H - 8} textAnchor="middle">{formatLabel(label)}</text> : null}
            </g>
          );
        })}
      </svg>
      <div className="gx-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--chart-1)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(28 - (v / max) * 26).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 30, direction: "ltr" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#9aa79c", "#c7a26b", "#6b8fb3"];

export function Donut({ rows, formatValue, ariaLabel, centerLabel }: { rows: { key: string; label: string; value: number }[]; formatValue: (v: number) => string; ariaLabel: string; centerLabel: string }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="gx-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${ariaLabel}: ${rows.map((r) => `${r.label} ${formatValue(r.value)}`).join("، ")}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--glass-hover)" strokeWidth="18" />
        {total > 0 ? rows.map((r, i) => {
          const len = (r.value / total) * C;
          const el = <circle key={r.key} cx="70" cy="70" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />;
          offset += len;
          return el;
        }) : null}
        <text x="70" y="66" textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: "var(--text-primary)" }}>{formatValue(total)}</text>
        <text x="70" y="86" textAnchor="middle" style={{ fontSize: 10 }}>{centerLabel}</text>
      </svg>
      <ul>
        {rows.map((r, i) => (
          <li key={r.key}><i className="gx-chip__dot" style={{ background: PALETTE[i % PALETTE.length] }} />{r.label}<b>{formatValue(r.value)}</b></li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({ rows, formatValue }: { rows: { key: string; label: string; value: number; hint?: string }[]; formatValue: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="gx-bars">
      {rows.map((r) => (
        <div key={r.key} className="gx-bar">
          <span title={r.hint}>{r.label}</span>
          <span className="gx-bar__track"><span className="gx-bar__fill" style={{ display: "block", width: `${Math.max(2, (r.value / max) * 100)}%` }} /></span>
          <b>{formatValue(r.value)}</b>
        </div>
      ))}
    </div>
  );
}
