import type { ReactNode } from "react";
import { cn } from "./cn";
import { ComponentStateView, type ComponentState } from "./ComponentState";

/** DS-05 fixed-slot card. Keep the slots stable across products, providers, orders, events and documents. */
export interface ObjectCardProps {
  image?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  state?: ComponentState;
  className?: string;
}

export function ObjectCard({ image, title, meta, status, action, state, className }: ObjectCardProps) {
  return (
    <ComponentStateView state={state} skeletonClassName="h-40 w-full">
      <article className={cn("pl-card grid grid-cols-[auto_minmax(0,1fr)] gap-3 border border-border-subtle bg-surface-elevated p-4 text-text-primary", className)}>
        {image ? <div className="overflow-hidden rounded-md bg-surface-subtle">{image}</div> : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-section-title">{title}</h3>
            {status ? <div className="shrink-0">{status}</div> : null}
          </div>
          {meta ? <div className="mt-1 text-metadata text-text-secondary">{meta}</div> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </article>
    </ComponentStateView>
  );
}
