import { cn } from "./cn";

export type StatusTone = "neutral" | "success" | "attention" | "higherConcern" | "urgent" | "emergency";

export interface StatusLabelProps {
  tone: StatusTone;
  children: string;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-subtle text-text-secondary",
  success: "bg-surface-subtle text-state-success",
  attention: "bg-surface-subtle text-state-attention",
  higherConcern: "bg-surface-subtle text-state-higher-concern",
  urgent: "bg-surface-subtle text-state-urgent",
  emergency: "bg-state-emergency text-text-inverse",
};

const toneSymbol: Record<StatusTone, string> = {
  neutral: "●",
  success: "✓",
  attention: "▲",
  higherConcern: "▲",
  urgent: "!",
  emergency: "!!",
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
      <span aria-hidden>{toneSymbol[tone]}</span>
      {children}
    </span>
  );
}
