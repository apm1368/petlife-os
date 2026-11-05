import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./Button";
import { cn } from "./cn";

/** DS-07: callers render one instance per page. It is thumb-zone sticky on mobile. */
export interface PrimaryActionBarProps extends Pick<ButtonProps, "disabled" | "isLoading" | "onClick" | "type"> {
  label: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}

export function PrimaryActionBar({ label, secondaryAction, className, ...buttonProps }: PrimaryActionBarProps) {
  return (
    <div className={cn("pl-primary-action flex items-center justify-end gap-2", className)}>
      {secondaryAction}
      <Button {...buttonProps} className="pl-touch-target" size="md">{label}</Button>
    </div>
  );
}
