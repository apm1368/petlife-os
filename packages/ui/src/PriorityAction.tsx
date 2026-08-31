import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

export interface PriorityActionProps {
  title: string;
  description?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  icon?: ReactNode;
  className?: string;
}

/** The single "next best action" surfaced by Home's ranking service. */
export function PriorityAction({
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  icon,
  className,
}: PriorityActionProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start gap-3">
        {icon ? <span aria-hidden className="mt-0.5 text-ai-primary">{icon}</span> : null}
        <div>
          <h3 className="text-section-title text-text-primary">{title}</h3>
          {description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onPrimary}>
          {primaryLabel}
        </Button>
        {secondaryLabel && onSecondary ? (
          <Button variant="secondary" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
