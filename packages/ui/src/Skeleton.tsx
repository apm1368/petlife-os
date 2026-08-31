import { cn } from "./cn";

export interface SkeletonProps {
  className?: string;
  "aria-label"?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label={props["aria-label"] ?? "Loading"}
      className={cn("animate-pulse rounded-md bg-surface-subtle motion-reduce:animate-none", className)}
    />
  );
}
