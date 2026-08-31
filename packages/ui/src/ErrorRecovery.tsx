import { Button } from "./Button";

export interface ErrorRecoveryProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

/** Standard "something failed" surface. Never resets surrounding layout — caller renders this in place. */
export function ErrorRecovery({ title, message, retryLabel, onRetry }: ErrorRecoveryProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-5">
      <div>
        <h3 className="text-section-title text-text-primary">{title}</h3>
        <p className="mt-1 text-body text-text-secondary">{message}</p>
      </div>
      <Button variant="secondary" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
