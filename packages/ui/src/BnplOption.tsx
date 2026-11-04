import type { ReactNode } from "react";
import { ComponentStateView, type ComponentState } from "./ComponentState";

/** PY-20 presentation only. The caller must read the existing feature-flag before rendering it. */
export interface BnplOptionProps {
  provider: "snapp-pay" | "digipay";
  title: string;
  description?: string;
  enabled: boolean;
  action?: ReactNode;
  state?: ComponentState;
}

export function BnplOption({ provider, title, description, enabled = false, action, state }: BnplOptionProps) {
  if (!enabled) return null;
  return <ComponentStateView state={state}><section className="pl-card border border-border-subtle bg-surface-elevated p-4" data-provider={provider}><h3 className="text-section-title text-text-primary">{title}</h3>{description ? <p className="mt-1 text-body text-text-secondary">{description}</p> : null}{action ? <div className="mt-3">{action}</div> : null}</section></ComponentStateView>;
}
