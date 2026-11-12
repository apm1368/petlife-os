"use client";

import "./admin-privacy.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import Link from "@/features/navigation/localized-link";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminPrivacyService, type AccountDeletionState, type AdminDeletionRequest } from "@/services/admin-privacy.service";

const GROUPS: AccountDeletionState[] = ["REQUESTED", "PENDING_RETENTION", "READY_FOR_EXECUTION", "CANCELLED", "COMPLETED"];
const NEXT: Partial<Record<AccountDeletionState, AccountDeletionState>> = { REQUESTED: "PENDING_RETENTION", PENDING_RETENTION: "READY_FOR_EXECUTION" };
const TONE: Record<AccountDeletionState, string> = { REQUESTED: "AT_RISK", PENDING_RETENTION: "NEW", READY_FOR_EXECUTION: "VIP", CANCELLED: "DORMANT", COMPLETED: "ACTIVE" };
const DATE_LOCALE: Record<RouteLocale, string> = { fa: "fa-IR-u-ca-persian-nu-arabext", en: "en-GB", de: "de-DE", es: "es-ES" };

/**
 * Admin → Users → Deletion requests: the members who asked to delete their account, oldest waiting first, and the
 * two staff steps the lifecycle allows (start retention review; mark ready once a retention policy is approved).
 * Nothing here deletes data — execution stays disabled on the server.
 */
export function AdminDeletionRequestsView() {
  const t = useTranslations("adminDeletionRequests");
  const locale = useLocale() as RouteLocale;
  const focus = useSearchParams().get("focus");
  const [rows, setRows] = useState<AdminDeletionRequest[] | null>(null);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);
  const [group, setGroup] = useState<AccountDeletionState>("REQUESTED");
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await adminPrivacyService.deletionRequests();
      setRows(list);
      setError(null);
      return list;
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed");
      return null;
    }
  }, []);
  useEffect(() => {
    void load().then((list) => {
      const target = focus && list?.find((r) => r.id === focus);
      if (target) setGroup(target.state);
    });
  }, [load, focus]);
  useEffect(() => {
    if (focus && rows) document.getElementById(`deletion-${focus}`)?.scrollIntoView?.({ block: "center" });
  }, [focus, rows, group]);

  const date = useMemo(() => new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }), [locale]);
  const number = useMemo(() => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : DATE_LOCALE[locale]), [locale]);
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g, rows?.filter((r) => r.state === g).length ?? 0])) as Record<AccountDeletionState, number>, [rows]);
  // Oldest waiting first: these are promises to members, not a feed.
  const shown = useMemo(() => (rows ?? []).filter((r) => r.state === group).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)), [rows, group]);
  const daysWaiting = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));

  const advance = async (row: AdminDeletionRequest) => {
    const to = NEXT[row.state];
    if (!to) return;
    setBusy(true);
    setActionError(null);
    try {
      await adminPrivacyService.transition(row.id, to, note.trim() || undefined);
      setActing(null);
      setNote("");
      setNotice(t(`done.${to}`, { name: row.displayName }));
      await load();
    } catch (e) {
      const reason = e instanceof ApiError ? (e.details?.reason as string | undefined) : undefined;
      setActionError(reason && t.has(`errors.${reason}`) ? t(`errors.${reason}`) : t("errors.generic"));
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
      <p className="gx-inline-note">{t("executionDisabled")}</p>
      {notice ? <p role="status" className="gx-inline-note">{notice}</p> : null}
      {error === "forbidden" ? (
        <p role="alert" className="gx-inline-alert">{t("errors.forbidden")}</p>
      ) : error ? (
        <div role="alert" className="gx-inline-alert">
          <p>{t("errors.load")}</p>
          <button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button>
        </div>
      ) : !rows ? (
        <div className="gx-card gx-skel" style={{ minHeight: 200 }} aria-busy="true" />
      ) : (
        <>
          <div className="gx-seg" role="group" aria-label={t("filterLabel")}>
            {GROUPS.map((g) => (
              <button key={g} type="button" aria-pressed={g === group} onClick={() => { setGroup(g); setActing(null); }}>
                {t(`state.${g}`)} · {number.format(counts[g])}
              </button>
            ))}
          </div>
          {!shown.length ? (
            <p className="gx-empty">{t(`empty.${group}`)}</p>
          ) : (
            <ul className="gx-list gx-deletion-list">
              {shown.map((r) => {
                const households = r.impactSnapshot?.households ?? [];
                const pets = households.reduce((s, h) => s + (h.pets ?? 0), 0);
                const shared = households.filter((h) => h.otherMembers > 0).length;
                const next = NEXT[r.state];
                return (
                  <li key={r.id} id={`deletion-${r.id}`} className={`gx-card gx-deletion${r.id === focus ? " gx-deletion--focus" : ""}`}>
                    <div className="gx-deletion__head">
                      <div>
                        <h2 className="gx-section-title"><Link href={`/admin/customers/${encodeURIComponent(r.userId)}`} className="gx-link">{r.displayName}</Link></h2>
                        <p className="gx-muted">{t("requested", { date: date.format(new Date(r.requestedAt)), days: daysWaiting(r.requestedAt) })}</p>
                      </div>
                      <span className={`gx-tag gx-tag--${TONE[r.state]}`}>{t(`state.${r.state}`)}</span>
                    </div>
                    <p>{households.length ? t("impact", { households: households.length, pets, shared }) : t("noImpact")}</p>
                    {households.some((h) => h.onlyOwnerWithOthers) ? <p className="gx-inline-alert">{t("soleOwner")}</p> : null}
                    {r.state !== "REQUESTED" ? <p className="gx-muted">{t("lastChange", { date: date.format(new Date(r.stateChangedAt)) })}{r.stateNote ? ` — ${r.stateNote}` : ""}</p> : null}
                    {next ? (
                      acting === r.id ? (
                        <form className="gx-deletion__act" onSubmit={(e) => { e.preventDefault(); void advance(r); }}>
                          <label className="gx-field">{t("note")}<input value={note} maxLength={500} autoFocus onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} /></label>
                          <p className="gx-muted">{t(`explain.${next}`)}</p>
                          {actionError ? <p role="alert" className="gx-inline-alert">{actionError}</p> : null}
                          <div className="gx-deletion__buttons">
                            <button type="submit" className="gx-btn gx-btn--primary" disabled={busy}>{t(`action.${next}`)}</button>
                            <button type="button" className="gx-btn" onClick={() => { setActing(null); setActionError(null); }}>{t("cancel")}</button>
                          </div>
                        </form>
                      ) : (
                        <div><button type="button" className="gx-btn" onClick={() => { setActing(r.id); setNote(""); setActionError(null); setNotice(null); }}>{t(`action.${next}`)}</button></div>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
