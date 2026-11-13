"use client";

import "./two-step.css";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "@petlife/ui";
import type { AdminTwoStepStatusDto } from "@petlife/types";
import { adminTwoStepService } from "@/services/admin-two-step.service";
import { useAdminStore } from "@/stores/admin-store";
import { adminService } from "@/services/admin.service";
import { TwoStepEnrol } from "./TwoStepEnrol";
import { asciiDigits, RecoveryCodes, TwoStepCodeInput, useTwoStepError, useTwoStepFormat } from "./two-step-ui";

type Mode = "idle" | "enrol" | "newCodes" | "turnOff";

/** /admin/two-step — every admin's own two-step sign-in: turn it on, new recovery codes, turn it off. */
export function AdminTwoStepView() {
  const t = useTranslations("adminTwoStep");
  const format = useTwoStepFormat();
  const describe = useTwoStepError();
  const setContext = useAdminStore((s) => s.setContext);
  const [status, setStatus] = useState<AdminTwoStepStatusDto | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await adminTwoStepService.status());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  /** The shell's banner reads /admin/me, so refresh it after any change. */
  const refreshShell = async () => {
    try {
      setContext(await adminService.getMe());
    } catch {
      /* the page itself already shows the new state */
    }
  };
  const finish = async (message: string) => {
    setMode("idle");
    setCode("");
    setCodes(null);
    setError(null);
    setNotice(message);
    await Promise.all([load(), refreshShell()]);
  };

  const withCode = async (action: (digits: string) => Promise<void>) => {
    const digits = asciiDigits(code);
    if (!/^\d{6}$/.test(digits)) return setError(t("errors.format"));
    setBusy(true);
    setError(null);
    try {
      await action(digits);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gx-page">
      <header className="gx-pagehead">
        <div className="gx-pagehead__text">
          <p className="gx-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p className="gx-muted">{t("intro")}</p>
        </div>
      </header>
      {notice ? <p role="status" className="gx-inline-note">{notice}</p> : null}
      {loadError ? (
        <div className="gx-inline-alert" role="alert">
          <p>{t("errors.generic")}</p>
          <button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button>
        </div>
      ) : !status ? (
        <div className="gx-card gx-skel" style={{ minHeight: 160 }} aria-busy="true" />
      ) : mode === "enrol" ? (
        <div className="gx-card">
          <TwoStepEnrol onDone={() => void finish(t("done.on"))} onCancel={() => { setMode("idle"); void load(); }} />
        </div>
      ) : codes ? (
        <div className="gx-card">
          <RecoveryCodes codes={codes} onDone={() => void finish(t("done.newCodes"))} />
        </div>
      ) : (
        <section className="gx-card gx-twostep-status" aria-labelledby="twostep-status-title">
          <div className="gx-twostep-statushead">
            <ShieldCheck size={22} aria-hidden="true" />
            <h2 id="twostep-status-title" className="gx-section-title">{t("title")}</h2>
            <span className={`gx-tag ${status.enrolled ? "gx-tag--ACTIVE" : "gx-tag--AT_RISK"}`}>{status.enrolled ? t("status.on") : t("status.off")}</span>
          </div>
          {status.enrolled && status.enrolledAt ? <p>{t("status.onSince", { date: format.date(status.enrolledAt) })}</p> : null}
          {status.enrolled && status.recoveryCodesLeft !== null ? (
            <p className={status.recoveryCodesLeft <= 3 ? "gx-inline-alert" : "gx-muted"}>
              {status.recoveryCodesLeft <= 3 ? t("status.recoveryLow", { count: status.recoveryCodesLeft }) : t("status.recoveryLeft", { count: status.recoveryCodesLeft })}
            </p>
          ) : null}
          <p className="gx-muted">
            {status.enforced
              ? status.graceEndsAt && !status.enrolled
                ? t("banner.enforced", { date: format.date(status.graceEndsAt) })
                : t("status.enforced")
              : t("status.optional")}
          </p>

          {mode === "newCodes" || mode === "turnOff" ? (
            <form
              className="gx-twostep-confirm"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void withCode(async (digits) => {
                  if (mode === "newCodes") setCodes((await adminTwoStepService.regenerate(digits)).recoveryCodes);
                  else {
                    await adminTwoStepService.disable(digits);
                    await finish(t("done.off"));
                  }
                });
              }}
            >
              <TwoStepCodeInput id="twostep-confirm-code" label={t("confirmCode.label")} value={code} onChange={setCode} autoFocus />
              <p className="gx-muted">{mode === "turnOff" ? t("confirmCode.turnOffHelp") : t("confirmCode.help")}</p>
              {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
              <div className="gx-twostep-actions">
                <button type="submit" className="gx-btn gx-btn--primary" disabled={busy}>{mode === "turnOff" ? t("actions.turnOff") : t("actions.newCodes")}</button>
                <button type="button" className="gx-btn" onClick={() => { setMode("idle"); setCode(""); setError(null); }}>{t("enrol.cancel")}</button>
              </div>
            </form>
          ) : (
            <div className="gx-twostep-actions">
              {!status.enrolled ? (
                <button type="button" className="gx-btn gx-btn--primary" onClick={() => { setNotice(null); setMode("enrol"); }}>{t("actions.turnOn")}</button>
              ) : (
                <>
                  <button type="button" className="gx-btn" onClick={() => { setNotice(null); setMode("newCodes"); }}>{t("actions.newCodes")}</button>
                  <button type="button" className="gx-btn" disabled={status.enforced} title={status.enforced ? t("actions.turnOffBlocked") : undefined} onClick={() => { setNotice(null); setMode("turnOff"); }}>
                    {t("actions.turnOff")}
                  </button>
                </>
              )}
            </div>
          )}
          {status.enrolled && status.enforced ? <p className="gx-muted">{t("actions.turnOffBlocked")}</p> : null}
        </section>
      )}
    </div>
  );
}
