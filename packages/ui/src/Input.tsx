import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
  successMessage?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, errorMessage, successMessage, hint, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = errorMessage ? `${inputId}-error` : undefined;
    const successId = successMessage && !errorMessage ? `${inputId}-success` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-metadata text-text-secondary">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-11 rounded-md border border-border-strong bg-surface-elevated px-3 text-body text-text-primary",
            "placeholder:text-text-disabled",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            errorMessage && "border-state-urgent",
            successMessage && !errorMessage && "border-state-success",
            className,
          )}
          aria-invalid={Boolean(errorMessage) || undefined}
          aria-describedby={cn(hintId, errorId, successId) || undefined}
          {...props}
        />
        {hint && !errorMessage ? (
          <p id={hintId} className="text-metadata text-text-secondary">
            {hint}
          </p>
        ) : null}
        {errorMessage ? (
          <p id={errorId} role="alert" className="text-metadata text-state-urgent">
            {errorMessage}
          </p>
        ) : null}
        {successMessage && !errorMessage ? (
          <p id={successId} className="text-metadata text-state-success">{successMessage}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
