"use client";

import "./two-step.css";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck } from "@petlife/ui";
import { Brand } from "@/features/brand/Brand";
import { useSignOut } from "@/features/account/use-sign-out";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminTwoStepService } from "@/services/admin-two-step.service";
import { TwoStepEnrol } from "./TwoStepEnrol";
import { asciiDigits, TwoStepCodeInput, useTwoStepError } from "./two-step-ui";

/**
 * Shown by the Admin Shell instead of any admin page while this session still has to pass two-step sign-in:
 * CHALLENGE asks for a code, ENROL (enforced, grace over) walks through setting it up.
 */
export function AdminTwoStepGate({ requirement, onPassed }: { requirement: "CHALLENGE" | "ENROL"; onPassed: () => void }) {
  const t = useTranslations("adminTwoStep");
  const locale = useLocale() as RouteLocale;
  const signOut = useSignOut();
  return (
    <div className="opl-page erp-shell gx-twostep-screen">
      <div className="gx-card gx-twostep-panel">
        <div className="gx-twostep-brand">
          <Brand compact locale={locale} />
        </div>
        <ShieldCheck size={28} aria-hidden="true" className="gx-twostep-icon" />
        <h1 className="gx-twostep-title">{requirement === "ENROL" ? t("forced.title") : t("challenge.title")}</h1>
        <p className="gx-muted">{requirement === "ENROL" ? t("forced.body") : t("challenge.body")}</p>
        {requirement === "ENROL" ? <TwoStepEnrol onDone={onPassed} /> : <Challenge onPassed={onPassed} />}
        <button type="button" className="gx-link gx-twostep-signout" onClick={() => void signOut()}>{t("challenge.signOut")}</button>
      </div>
    </div>
  );
}

function Challenge({ onPassed }: { onPassed: () => void }) {
  const t = useTranslations("adminTwoStep");
  const describe = useTwoStepError();
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = asciiDigits(value);
    if (!recovery && !/^\d{6}$/.test(code)) return setError(t("errors.format"));
    if (recovery && code.replace(/[^A-Za-z2-7]/g, "").length !== 16) return setError(t("errors.recoveryFormat"));
    setBusy(true);
    setError(null);
    try {
      await adminTwoStepService.verify(recovery ? { recoveryCode: code } : { code });
      onPassed();
    } catch (e) {
      setError(describe(e));
      setBusy(false);
    }
  };

  return (
    <form className="gx-twostep-challenge" onSubmit={submit} noValidate>
      <TwoStepCodeInput
        key={recovery ? "recovery" : "app"}
        id="twostep-challenge-code"
        label={recovery ? t("challenge.recoveryLabel") : t("challenge.codeLabel")}
        value={value}
        onChange={setValue}
        recovery={recovery}
        autoFocus
      />
      {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
      <button type="submit" className="gx-btn gx-btn--primary" disabled={busy}>{t("challenge.submit")}</button>
      <button
        type="button"
        className="gx-link"
        onClick={() => {
          setRecovery((v) => !v);
          setValue("");
          setError(null);
        }}
      >
        {recovery ? t("challenge.useApp") : t("challenge.useRecovery")}
      </button>
      <p className="gx-muted gx-twostep-help">{t("challenge.lostPhone")}</p>
    </form>
  );
}
