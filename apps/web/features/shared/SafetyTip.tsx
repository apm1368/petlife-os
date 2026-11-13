"use client";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "@petlife/ui";

export type SafetyTipKind = "contact" | "payment" | "lostPet" | "donation" | "adoption";

/**
 * Anti-scam reminder (market-readiness #290, Q59: shown on every contact and payment surface).
 * Plain product copy from messages.safety, never user text; an aside so it doesn't interrupt the task flow.
 */
export function SafetyTip({ kind, className }: { kind: SafetyTipKind; className?: string }) {
  const t = useTranslations("safety");
  return (
    <aside className={`safety-tip${className ? ` ${className}` : ""}`} aria-label={t("title")} data-kind={kind}>
      <ShieldCheck size={18} aria-hidden="true" className="safety-tip__icon" />
      <p>
        <strong>{t("title")}</strong>
        <span>{t(kind)}</span>
      </p>
    </aside>
  );
}
