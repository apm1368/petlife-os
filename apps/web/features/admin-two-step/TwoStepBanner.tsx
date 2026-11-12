"use client";

import "./two-step.css";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "@petlife/ui";
import type { AdminTwoStepGateDto } from "@petlife/types";
import Link from "@/features/navigation/localized-link";
import { useTwoStepFormat } from "./two-step-ui";

const DISMISS_KEY = "opl.admin.twoStepBanner";

/** A quiet reminder above admin pages while this admin hasn't turned two-step on. Only dismissable while optional. */
export function TwoStepBanner({ gate }: { gate: AdminTwoStepGateDto }) {
  const t = useTranslations("adminTwoStep");
  const format = useTwoStepFormat();
  // The shell only renders after its client-side bootstrap, so reading sessionStorage on first render is safe.
  const [dismissed, setDismissed] = useState(() => {
    if (gate.enforced) return false;
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (gate.enrolled || (dismissed && !gate.enforced)) return null;
  return (
    <div className="gx-twostep-banner" role="note">
      <ShieldCheck size={18} aria-hidden="true" />
      <p>{gate.enforced && gate.graceEndsAt ? t("banner.enforced", { date: format.date(gate.graceEndsAt) }) : t("banner.optional")}</p>
      <Link href="/admin/two-step" className="gx-btn gx-btn--primary">{t("banner.action")}</Link>
      {!gate.enforced ? (
        <button
          type="button"
          className="gx-link"
          onClick={() => {
            setDismissed(true);
            try {
              window.sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* dismissed for this page view only */
            }
          }}
        >
          {t("banner.dismiss")}
        </button>
      ) : null}
    </div>
  );
}
