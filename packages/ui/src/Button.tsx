import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand-natural text-text-inverse hover:bg-brand-natural-strong",
  secondary: "bg-surface-elevated text-text-primary border border-border-strong hover:bg-surface-subtle",
  ghost: "bg-transparent text-text-primary hover:bg-surface-subtle",
  danger: "bg-state-urgent text-text-inverse hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-cta",
  md: "h-11 px-4 text-cta",
  lg: "h-13 px-6 text-cta",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
