"use client";

import { useEffect, useRef, useId } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { motion, useReducedMotion } from "motion/react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/** Bottom sheet on mobile widths, right/left-anchored panel on wider ones (mirrors RTL/LTR via inset-inline). */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby={titleId}
      className={cn(
        "m-0 h-full max-h-full w-full max-w-full border-0 bg-transparent p-0 backdrop:bg-surface-overlay",
        "open:flex open:items-end sm:ms-auto sm:me-0 sm:max-w-sm sm:open:items-stretch",
      )}
    >
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0, y: open ? 0 : 16 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
        className={cn(
          "flex w-full max-h-[85dvh] flex-col gap-4 rounded-t-lg border-t border-border-subtle bg-surface-elevated p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-text-primary",
          "sm:max-h-full sm:rounded-none sm:border-s",
          className,
        )}
      >
        <h2 id={titleId} className="text-section-title text-text-primary">
          {title}
        </h2>
        <div className="overflow-y-auto">{children}</div>
      </motion.div>
    </dialog>
  );
}
