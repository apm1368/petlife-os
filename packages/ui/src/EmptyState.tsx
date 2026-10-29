import { useId, type ReactNode } from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  const titleId = useId();
  return (
    <section className="flex min-h-48 flex-col items-center justify-center gap-3 border-y border-border-subtle py-10 text-center" aria-labelledby={titleId}>
      {icon ? <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-text-secondary">{icon}</span> : null}
      <div className="max-w-lg">
        <h3 id={titleId} className="text-section-title text-text-primary">{title}</h3>
        {description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}
