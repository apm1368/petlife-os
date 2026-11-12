"use client";

import "./two-step.css";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminTwoStepPolicyDto } from "@petlife/types";
import Link from "@/features/navigation/localized-link";
import { useAdminStore } from "@/stores/admin-store";
import { adminTwoStepService } from "@/services/admin-two-step.service";
import { useTwoStepError, useTwoStepFormat } from "./two-step-ui";

type Member = AdminTwoStepPolicyDto["members"][number];

/** /admin/access/two-step — whether two-step sign-in is required for the team, who has it on, and resets for lost phones. */
export function AdminTwoStepPolicyView() {
  const t = useTranslations("adminTwoStep");
  const tShell = useTranslations("admin.shell");
  const format = useTwoStepFormat();
  const describe = useTwoStepError();
  const context = useAdminStore((s) => s.context);
  const canManage = !!context?.permissions.includes("admin.manage");
  const selfEnrolled = !!context?.twoStep?.enrolled;
  const [policy, setPolicy] = useState<AdminTwoStepPolicyDto | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [enforced, setEnforced] = useState(false);
  const [graceDays, setGraceDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [resetReason, setResetReason] = useState("");

  const apply = (p: AdminTwoStepPolicyDto) => {
    setPolicy(p);
    setEnforced(p.enforced);
    setGraceDays(p.graceDays);
  };
  const load = useCallback(async () => {
    try {
      apply(await adminTwoStepService.policy());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const roleLabel = (role: string) => (tShell.has(`role.${role}`) ? tShell(`role.${role}`) : role.replace(/_/g, " "));
  const memberState = (m: Member) => {
    if (m.enrolled && m.enrolledAt) return { tone: "ACTIVE", text: t("policy.member.on", { date: format.date(m.enrolledAt) }) };
    if (m.graceEndsAt && new Date(m.graceEndsAt) > new Date()) return { tone: "AT_RISK", text: t("policy.member.grace", { date: format.date(m.graceEndsAt) }) };
    if (m.graceEndsAt) return { tone: "NEVER_PURCHASED", text: t("policy.member.overdue") };
    return { tone: "DORMANT", text: t("policy.member.off") };
  };
  const dirty = !!policy && (enforced !== policy.enforced || graceDays !== policy.graceDays);
  const blockedBySelf = enforced && !selfEnrolled;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 5) return setError(t("policy.reasonRequired"));
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await adminTwoStepService.setPolicy({ enforced, graceDays, reason: reason.trim() }));
      setReason("");
      setNotice(t("policy.saved"));
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!resetting) return;
    if (resetReason.trim().length < 5) return setError(t("policy.reasonRequired"));
    setBusy(true);
    setError(null);
    try {
      await adminTwoStepService.reset(resetting.adminUserId, resetReason.trim());
      setNotice(t("policy.resetDone", { name: resetting.displayName }));
      setResetting(null);
      setResetReason("");
      await load();
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
          <h1>{t("policy.title")}</h1>
          <p className="gx-muted">{t("policy.intro")}</p>
        </div>
        <div className="gx-pagehead__actions">
          <Link href="/admin/two-step" className="gx-btn">{selfEnrolled ? t("policy.mine") : t("policy.selfFirstAction")}</Link>
        </div>
      </header>
      {notice ? <p role="status" className="gx-inline-note">{notice}</p> : null}
      {loadError ? (
        <div className="gx-inline-alert" role="alert">
          <p>{t("errors.generic")}</p>
          <button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button>
        </div>
      ) : !policy ? (
        <div className="gx-card gx-skel" style={{ minHeight: 200 }} aria-busy="true" />
      ) : (
        <>
          <form className="gx-card gx-twostep-policy" onSubmit={save} noValidate aria-labelledby="twostep-policy-title">
            <div className="gx-twostep-statushead">
              <h2 id="twostep-policy-title" className="gx-section-title">{t("policy.required")}</h2>
              <span className={`gx-tag ${policy.enforced ? "gx-tag--ACTIVE" : "gx-tag--DORMANT"}`}>{policy.enforced ? t("policy.on") : t("policy.off")}</span>
            </div>
            <p className="gx-muted">
              {t("policy.coverage", { enrolled: policy.enrolledCount, total: policy.members.length })}
              {policy.enforced && policy.enforcedAt ? ` · ${t("policy.since", { date: format.date(policy.enforcedAt) })}` : ""}
            </p>
            {canManage ? (
              <>
                <label className="gx-twostep-check">
                  <input type="checkbox" checked={enforced} onChange={(e) => setEnforced(e.target.checked)} />
                  {t("policy.required")}
                </label>
                <label className="gx-field">
                  {t("policy.graceDays")}
                  <input type="number" min={0} max={30} value={graceDays} onChange={(e) => setGraceDays(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
                </label>
                <p className="gx-muted">{t("policy.graceHelp")}</p>
                <label className="gx-field">
                  {t("policy.reason")}
                  <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t("policy.reasonPlaceholder")} />
                </label>
                {blockedBySelf ? (
                  <p className="gx-inline-alert">
                    {t("policy.selfFirst")} <Link href="/admin/two-step" className="gx-link">{t("policy.selfFirstAction")}</Link>
                  </p>
                ) : null}
                {error && !resetting ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
                <div className="gx-twostep-actions">
                  <button type="submit" className="gx-btn gx-btn--primary" disabled={busy || !dirty || blockedBySelf}>{t("policy.save")}</button>
                </div>
              </>
            ) : (
              <p className="gx-muted">{t("policy.onlySuper")}</p>
            )}
          </form>

          <section className="gx-card" aria-labelledby="twostep-members-title">
            <h2 id="twostep-members-title" className="gx-section-title">{t("policy.members")}</h2>
            <div className="gx-table-wrap">
              <table className="gx-table">
                <thead>
                  <tr>
                    <th scope="col">{t("policy.col.name")}</th>
                    <th scope="col">{t("policy.col.role")}</th>
                    <th scope="col">{t("policy.col.status")}</th>
                    {canManage ? <th scope="col"><span className="sr-only">{t("policy.reset")}</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {policy.members.map((m) => {
                    const state = memberState(m);
                    const self = m.adminUserId === context?.adminUserId;
                    return (
                      <tr key={m.adminUserId}>
                        <td>{m.displayName}{self ? <span className="gx-muted"> · {t("policy.you")}</span> : null}</td>
                        <td>{roleLabel(m.role)}</td>
                        <td><span className={`gx-tag gx-tag--${state.tone}`}>{state.text}</span></td>
                        {canManage ? (
                          <td>
                            {m.enrolled && !self ? (
                              <button type="button" className="gx-btn" onClick={() => { setResetting(m); setResetReason(""); setError(null); }}>{t("policy.reset")}</button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {resetting ? (
            <section className="gx-card gx-twostep-reset" role="dialog" aria-modal="false" aria-labelledby="twostep-reset-title">
              <h2 id="twostep-reset-title" className="gx-section-title">{t("policy.resetTitle", { name: resetting.displayName })}</h2>
              <p className="gx-muted">{t("policy.resetBody")}</p>
              <label className="gx-field">
                {t("policy.reason")}
                <input value={resetReason} maxLength={500} autoFocus onChange={(e) => setResetReason(e.target.value)} placeholder={t("policy.resetReasonPlaceholder")} />
              </label>
              {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
              <div className="gx-twostep-actions">
                <button type="button" className="gx-btn gx-btn--honey" disabled={busy} onClick={() => void reset()}>{t("policy.resetConfirm")}</button>
                <button type="button" className="gx-btn" onClick={() => { setResetting(null); setError(null); }}>{t("enrol.cancel")}</button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
