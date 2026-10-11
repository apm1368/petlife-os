import { Check, CircleAlert, Dot, OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

export type StatusTone = "neutral" | "success" | "attention" | "higherConcern" | "urgent" | "emergency";

export interface StatusLabelProps {
  tone: StatusTone;
  children: string;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-subtle text-text-secondary",
  success: "bg-[var(--status-success-tint)] text-state-success",
  attention: "bg-[var(--status-attention-tint)] text-state-attention",
  higherConcern: "bg-[var(--status-attention-tint)] text-state-higher-concern",
  urgent: "bg-[var(--status-concern-tint)] text-state-urgent",
  emergency: "bg-state-emergency text-text-inverse",
};

const toneIcon: Record<StatusTone, typeof Check> = {
  neutral: Dot,
  success: Check,
  attention: TriangleAlert,
  higherConcern: TriangleAlert,
  urgent: CircleAlert,
  emergency: OctagonAlert,
};

/** Status is always conveyed by icon/symbol + text, never color alone. */
export function StatusLabel({ tone, children, className }: StatusLabelProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-status",
        toneClasses[tone],
        className,
      )}
    >
      {(() => { const Icon = toneIcon[tone]; return <Icon size={tone === "neutral" ? 16 : 12} strokeWidth={tone === "neutral" ? 4 : 2.5} aria-hidden="true" className={tone === "neutral" ? "-mx-1" : undefined} />; })()}
      {children}
    </span>
  );
}
