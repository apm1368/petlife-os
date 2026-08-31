"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

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
      aria-labelledby="sheet-title"
      className={cn(
        "m-0 h-full max-h-full w-full max-w-full border-0 bg-transparent p-0 backdrop:bg-surface-overlay",
        "sm:m-auto sm:h-auto sm:max-w-sm",
      )}
    >
      <div
        className={cn(
          "flex max-h-[85vh] flex-col gap-4 rounded-t-lg border-t border-border-subtle bg-surface-elevated p-6 text-text-primary",
          "sm:rounded-lg sm:border",
          className,
        )}
      >
        <h2 id="sheet-title" className="text-section-title text-text-primary">
          {title}
        </h2>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}