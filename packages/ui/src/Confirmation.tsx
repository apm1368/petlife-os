"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface InlineConfirmationProps {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Reversible action confirmation that preserves page context. */
export function InlineConfirmation({ title, description, confirmLabel, cancelLabel, onConfirm, onCancel }: InlineConfirmationProps) {
  return <section className="pl-card border border-border-subtle bg-surface-elevated p-4" aria-label={title}>
    <h3 className="text-section-title text-text-primary">{title}</h3>
    {description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button><Button onClick={onConfirm}>{confirmLabel}</Button></div>
  </section>;
}

export interface ConfirmationDialogProps extends Omit<InlineConfirmationProps, "onCancel"> {
  open: boolean;
  onClose: () => void;
  destructive?: boolean;
}

/** Dialog confirmation for a consequential action. */
export function ConfirmationDialog({ open, onClose, title, description, confirmLabel, onConfirm, destructive }: ConfirmationDialogProps) {
  return <Dialog open={open} onClose={onClose} title={title}>
    {description ? <p className="text-body text-text-secondary">{description}</p> : null}
    <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onClose}>انصراف</Button><Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></div>
  </Dialog>;
}

export interface TypedConfirmationProps {
  title: string;
  description?: string;
  confirmationText: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** DS-06 irreversible confirmation: the exact supplied phrase must be typed. */
export function TypedConfirmation({ title, description, confirmationText, confirmLabel, onConfirm }: TypedConfirmationProps) {
  const [value, setValue] = useState("");
  const inputId = useId();
  return <section className="pl-card border border-state-urgent bg-surface-elevated p-4" aria-labelledby={`${inputId}-title`}>
    <h3 id={`${inputId}-title`} className="text-section-title text-text-primary">{title}</h3>
    {description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}
    <label htmlFor={inputId} className="mt-4 block text-metadata text-text-secondary">{confirmationText}</label>
    <input id={inputId} value={value} onChange={(event) => setValue(event.target.value)} className="pl-touch-target mt-1 w-full rounded-md border border-border-strong bg-surface-elevated px-3 text-body text-text-primary" />
    <div className="mt-4"><Button variant="danger" disabled={value !== confirmationText} onClick={onConfirm}>{confirmLabel}</Button></div>
  </section>;
}

export type ConfirmationPattern = "inline" | "dialog" | "typed";
export type ConfirmationContent = ReactNode;
