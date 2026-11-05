import type { ReactNode } from "react";
import { cn } from "./cn";
import { ComponentStateView, type ComponentState } from "./ComponentState";

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartProps {
  title: string;
  points: readonly ChartPoint[];
  valueLabel: (value: number) => string;
  state?: ComponentState;
  className?: string;
  footer?: ReactNode;
}

/** DS-15 lightweight shared chart primitive. Values preserve supplied Persian/Arabic digits. */
export function BarChart({ title, points, valueLabel, state, className, footer }: ChartProps) {
  const maximum = Math.max(...points.map((point) => point.value), 1);
  return <ComponentStateView state={state} skeletonClassName="h-56 w-full">
    <section className={cn("pl-card border border-border-subtle bg-surface-elevated p-4", className)} aria-label={title}>
      <h3 className="text-section-title text-text-primary">{title}</h3>
      <ol className="mt-4 grid grid-flow-col auto-cols-fr items-end gap-2" aria-label={title}>
        {points.map((point) => <li key={point.label} className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className="text-status text-text-secondary" dir="auto">{valueLabel(point.value)}</span>
          <span className="pl-chart-bar w-full rounded-sm bg-brand-solid" style={{ "--pl-chart-bar-size": String(Math.max(point.value / maximum, 0.04)) } as React.CSSProperties} aria-hidden />
          <span className="truncate text-status text-text-secondary" dir="auto">{point.label}</span>
        </li>)}
      </ol>
      {footer ? <div className="mt-4 text-metadata text-text-secondary">{footer}</div> : null}
    </section>
  </ComponentStateView>;
}
