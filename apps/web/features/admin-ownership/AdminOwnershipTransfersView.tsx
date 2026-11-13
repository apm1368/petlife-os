"use client";

import "./admin-ownership.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import Link from "@/features/navigation/localized-link";
import type { RouteLocale } from "@/lib/i18n/config";
import { useAdminStore } from "@/stores/admin-store";
import { refreshQueues } from "@/features/admin/admin-queues";
import { adminOwnershipService, type AdminOwnershipTransfer, type OwnershipTransferStatus } from "@/services/admin-ownership.service";

const FILTERS: Array<OwnershipTransferStatus | "ALL"> = ["DISPUTED", "PENDING_REVIEW", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED", "ALL"];
const TONE: Record<OwnershipTransferStatus, string> = { DISPUTED: "NEVER_PURCHASED", PENDING_REVIEW: "AT_RISK", ACCEPTED: "ACTIVE", DECLINED: "DORMANT", CANCELLED: "DORMANT", EXPIRED: "DORMANT" };
const DATE_LOCALE: Record<RouteLocale, string> = { fa: "fa-IR-u-ca-persian-nu-arabext", en: "en-GB", de: "de-DE", es: "es-ES", ar: "ar", nl: "nl-NL" };

/**
 * Admin → Users → Ownership transfers: every two-party transfer request and, first, the disputed ones (ID-03). Staff
 * close a dispute with a reason once they've seen the documents; closing never moves the pet — an applied transfer
 * stands, a pending one is closed and the registered owner stays. Both parties are notified.
 */
export function AdminOwnershipTransfersView() {
  const t = useTranslations("adminOwnership");
  const locale = useLocale() as RouteLocale;
  const focus = useSearchParams().get("focus");
  const canClose = !!useAdminStore((s) => s.context?.permissions.includes("customer.account.manage"));
  const [filter, setFilter] = useState<OwnershipTransferStatus | "ALL">("DISPUTED");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ items: AdminOwnershipTransfer[]; total: number; disputed: number } | null>(null);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminOwnershipService.list({ status: filter === "ALL" ? undefined : filter, q: query || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed");
    }
  }, [filter, query]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (focus && data) document.getElementById(`ownership-${focus}`)?.scrollIntoView?.({ block: "center" });
  }, [focus, data]);

  const date = useMemo(() => new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", { dateStyle: "medium", timeZone: "Asia/Tehran" }), [locale]);
  const fmt = (v: string | null) => (v ? date.format(new Date(v)) : "—");

  const close = async (row: AdminOwnershipTransfer) => {
    if (reason.trim().length < 5) return setActionError(t("errors.reason"));
    setBusy(true);
    setActionError(null);
    try {
      await adminOwnershipService.closeDispute(row.id, reason.trim());
      setNotice(row.appliedAt ? t("done.stands", { pet: row.pet.name }) : t("done.ownerStays", { pet: row.pet.name }));
      setClosing(null);
      setReason("");
      await load();
      void refreshQueues(true);
    } catch (e) {
      const rule = e instanceof ApiError ? (e.details?.rule as string | undefined) : undefined;
      setActionError(rule && t.has(`rules.${rule}`) ? t(`rules.${rule}`) : t("errors.generic"));
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
      <div className="gx-card gx-ownership-filters">
        <div className="gx-seg" role="group" aria-label={t("filterLabel")}>
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={f === filter} onClick={() => { setFilter(f); setClosing(null); }}>
              {t(`status.${f}`)}{f === "DISPUTED" && data ? ` · ${new Intl.NumberFormat(locale === "fa" ? "fa-IR" : DATE_LOCALE[locale]).format(data.disputed)}` : ""}
            </button>
          ))}
        </div>
        <form role="search" className="gx-ownership-search" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <label className="gx-field">{t("search")}<input value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} /></label>
          <button type="submit" className="gx-btn">{t("apply")}</button>
        </form>
      </div>
      {error === "forbidden" ? (
        <p role="alert" className="gx-inline-alert">{t("errors.forbidden")}</p>
      ) : error ? (
        <div role="alert" className="gx-inline-alert"><p>{t("errors.load")}</p><button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button></div>
      ) : !data ? (
        <div className="gx-card gx-skel" style={{ minHeight: 200 }} aria-busy="true" />
      ) : !data.items.length ? (
        <p className="gx-empty">{filter === "DISPUTED" ? t("emptyDisputed") : t("empty")}</p>
      ) : (
        <ul className="gx-ownership-list">
          {data.items.map((r) => (
            <li key={r.id} id={`ownership-${r.id}`} className={`gx-card gx-ownership${r.id === focus ? " gx-ownership--focus" : ""}`}>
              <div className="gx-ownership__head">
                <h2 className="gx-section-title">{r.pet.name}</h2>
                <span className={`gx-tag gx-tag--${TONE[r.status]}`}>{t(`status.${r.status}`)}</span>
              </div>
              <p>
                <Link href={`/admin/customers/${encodeURIComponent(r.from.userId)}`} className="gx-link">{r.from.name}</Link>
                {" → "}
                <Link href={`/admin/customers/${encodeURIComponent(r.to.userId)}`} className="gx-link">{r.to.name}</Link>
              </p>
              <dl className="gx-ownership__facts">
                <div><dt>{t("registeredOwner")}</dt><dd>{r.registeredOwner ? <Link href={`/admin/customers/${encodeURIComponent(r.registeredOwner.userId)}`} className="gx-link">{r.registeredOwner.name}</Link> : "—"}</dd></div>
                <div><dt>{t("requested")}</dt><dd>{fmt(r.createdAt)}</dd></div>
                <div><dt>{t("applied")}</dt><dd>{r.appliedAt ? fmt(r.appliedAt) : t("notApplied")}</dd></div>
                <div><dt>{t("memories")}</dt><dd>{t.has(`memory.${r.memoryDisposition}`) ? t(`memory.${r.memoryDisposition}`) : r.memoryDisposition}</dd></div>
              </dl>
              {r.note ? <p className="gx-muted gx-ownership__note">«{r.note}»</p> : null}
              {r.status === "DISPUTED" ? (
                <p className="gx-inline-note">{r.appliedAt ? t("explain.applied") : t("explain.pending")}</p>
              ) : null}
              {r.status === "DISPUTED" && canClose ? (
                closing === r.id ? (
                  <form className="gx-ownership__close" onSubmit={(e) => { e.preventDefault(); void close(r); }}>
                    <label className="gx-field">{t("reason")}<input value={reason} maxLength={1000} autoFocus onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} /></label>
                    {actionError ? <p role="alert" className="gx-inline-alert">{actionError}</p> : null}
                    <div className="gx-ownership__buttons">
                      <button type="submit" className="gx-btn gx-btn--primary" disabled={busy}>{t("close")}</button>
                      <button type="button" className="gx-btn" onClick={() => { setClosing(null); setActionError(null); }}>{t("cancel")}</button>
                    </div>
                  </form>
                ) : (
                  <div><button type="button" className="gx-btn" onClick={() => { setClosing(r.id); setReason(""); setActionError(null); setNotice(null); }}>{t("close")}</button></div>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
