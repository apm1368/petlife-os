"use client";

import { useEffect, useRef, useId } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { motion, useReducedMotion } from "motion/react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Backed by native <dialog> so focus trapping, Esc-to-close, and the
 * top-layer/backdrop come from the platform instead of a hand-rolled trap.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
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
        "rounded-lg border border-border-subtle bg-surface-elevated p-6 text-text-primary shadow-xl backdrop:bg-surface-overlay",
        "w-full max-w-md",
        className,
      )}
    >
      <motion.div initial={false} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }}>
      <h2 id={titleId} className="text-section-title text-text-primary">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
      </motion.div>
    </dialog>
  );
}
