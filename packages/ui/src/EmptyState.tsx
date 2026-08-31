import type { ReactNode } from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-subtle p-8 text-center">
      {icon ? <span aria-hidden className="text-text-disabled">{icon}</span> : null}
      <div>
        <h3 className="text-section-title text-text-primary">{title}</h3>
        {description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
