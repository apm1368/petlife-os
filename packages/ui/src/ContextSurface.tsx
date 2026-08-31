import type { ReactNode } from "react";
import { cn } from "./cn";

export interface ContextSurfaceProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}

/** The one reusable "card" shell — contextual groupings on Home, Pet Profile, etc. */
export function ContextSurface({ children, className, as = "section" }: ContextSurfaceProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-elevated p-5",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
