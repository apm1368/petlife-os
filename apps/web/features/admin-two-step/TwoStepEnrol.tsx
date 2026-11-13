"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminTwoStepEnrolmentDto } from "@petlife/types";
import { adminTwoStepService } from "@/services/admin-two-step.service";
import { asciiDigits, RecoveryCodes, TwoStepCodeInput, useTwoStepError } from "./two-step-ui";

/**
 * Add the setup key to an authenticator app, prove one code, keep the recovery codes. The server only switches two-step on after the
 * code checks out, so leaving half-way changes nothing.
 */
export function TwoStepEnrol({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const t = useTranslations("adminTwoStep");
  const describe = useTwoStepError();
  const [setup, setSetup] = useState<AdminTwoStepEnrolmentDto | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    adminTwoStepService.start().then(setSetup).catch((e: unknown) => setError(describe(e)));
  }, [describe]);

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = asciiDigits(code);
    if (!/^\d{6}$/.test(digits)) return setError(t("errors.format"));
    setBusy(true);
    setError(null);
    try {
      setCodes((await adminTwoStepService.confirm(digits)).recoveryCodes);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="gx-twostep-enrol" onSubmit={submit} noValidate>
      <section aria-labelledby="twostep-scan">
        <h2 id="twostep-scan" className="gx-section-title">{t("enrol.step1")}</h2>
        <p className="gx-muted">{t("enrol.step1Help")}</p>
        {setup ? (
          <dl className="gx-twostep-key">
            <div>
              <dt className="gx-muted">{t("enrol.accountLabel")}</dt>
              <dd dir="ltr">{setup.issuer} · {setup.account}</dd>
            </div>
            <div>
              <dt className="gx-muted">{t("enrol.keyLabel")}</dt>
              <dd><code dir="ltr">{setup.secret}</code></dd>
            </div>
            <div>
              <dt className="gx-muted">{t("enrol.typeLabel")}</dt>
              <dd>{t("enrol.type")}</dd>
            </div>
            <div className="gx-twostep-actions">
              <button
                type="button"
                className="gx-btn"
                onClick={() => void navigator.clipboard?.writeText(setup.secret.replace(/ /g, "")).then(() => setCopied(true), () => setCopied(false))}
              >
                {copied ? t("enrol.copied") : t("enrol.copyKey")}
              </button>
              <a className="gx-btn gx-twostep-open" href={setup.otpauthUri}>{t("enrol.openApp")}</a>
            </div>
          </dl>
        ) : error ? null : (
          <div className="gx-skel gx-twostep-keyskel" aria-label={t("enrol.starting")} />
        )}
      </section>
      <section aria-labelledby="twostep-confirm">
        <h2 id="twostep-confirm" className="gx-section-title">{t("enrol.step2")}</h2>
        <TwoStepCodeInput id="twostep-enrol-code" label={t("challenge.codeLabel")} value={code} onChange={setCode} />
        {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
        <div className="gx-twostep-actions">
          <button type="submit" className="gx-btn gx-btn--primary" disabled={!setup || busy}>{t("enrol.confirm")}</button>
          {onCancel ? <button type="button" className="gx-btn" onClick={onCancel}>{t("enrol.cancel")}</button> : null}
        </div>
      </section>
    </form>
  );
}
