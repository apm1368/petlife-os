import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  errorMessage?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, placeholder, errorMessage, id, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-metadata text-text-secondary">
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "h-11 rounded-md border border-border-strong bg-surface-elevated px-3 text-body text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            errorMessage && "border-state-urgent",
            className,
          )}
          aria-invalid={Boolean(errorMessage) || undefined}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errorMessage ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  },
);
Select.displayName = "Select";
