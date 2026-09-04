import { Button } from "./Button";
import { CircleAlert } from "lucide-react";

export interface ErrorRecoveryProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

/** Standard "something failed" surface. Never resets surrounding layout — caller renders this in place. */
export function ErrorRecovery({ title, message, retryLabel, onRetry }: ErrorRecoveryProps) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-border-subtle border-s-2 border-s-state-urgent bg-surface-elevated p-4">
      <CircleAlert size={20} className="shrink-0 text-state-urgent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="text-cta text-text-primary">{title}</h3>
        {message && <p className="mt-1 text-body text-text-secondary">{message}</p>}
      </div>
      <Button variant="secondary" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
