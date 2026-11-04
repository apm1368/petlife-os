import { LockKeyhole, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { ErrorRecovery } from "./ErrorRecovery";
import { Skeleton } from "./Skeleton";

/** The five non-happy-path states required by DS-06. */
export type ComponentState = "ready" | "loading" | "empty" | "error" | "offline" | "no-access";

export interface ComponentStateProps {
  state?: ComponentState;
  children: ReactNode;
  empty?: { title: string; description?: string; actionLabel?: string; onAction?: () => void };
  error?: { title: string; message: string; retryLabel: string; onRetry: () => void };
  offlineMessage?: string;
  noAccess?: { title: string; description?: string };
  skeletonClassName?: string;
}

/** Renders an honest state without inventing data. Consumers supply product-specific copy. */
export function ComponentStateView({
  state = "ready",
  children,
  empty,
  error,
  offlineMessage = "اتصال اینترنت برقرار نیست.",
  noAccess,
  skeletonClassName,
}: ComponentStateProps) {
  if (state === "loading") return <Skeleton className={skeletonClassName ?? "h-40 w-full"} />;
  if (state === "empty") return <EmptyState title={empty?.title ?? "اطلاعاتی وجود ندارد"} description={empty?.description} actionLabel={empty?.actionLabel} onAction={empty?.onAction} />;
  if (state === "error") return <ErrorRecovery title={error?.title ?? "مشکلی پیش آمد"} message={error?.message ?? "دوباره تلاش کنید."} retryLabel={error?.retryLabel ?? "تلاش دوباره"} onRetry={error?.onRetry ?? (() => undefined)} />;
  if (state === "offline") {
    return <><div role="status" className="flex items-center justify-center gap-2 bg-state-attention px-4 py-2 text-center text-status text-text-inverse"><WifiOff size={16} aria-hidden />{offlineMessage}</div>{children}</>;
  }
  if (state === "no-access") {
    return <EmptyState title={noAccess?.title ?? "دسترسی ندارید"} description={noAccess?.description ?? "برای دیدن این بخش باید دسترسی لازم را داشته باشید."} icon={<LockKeyhole />} />;
  }
  return <>{children}</>;
}
