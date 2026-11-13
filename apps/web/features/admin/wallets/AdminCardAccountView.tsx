"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AdminCardTransferDestinationDto, AdminCardTransferDestinationOverviewDto, AdminCardTransferDestinationPendingDto } from "@petlife/types";
import { Wallet } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminWalletsService } from "@/services/admin-wallets.service";
import "./admin-wallets.css";

const EMPTY = { cardNumber: "", sheba: "", holderName: "", bankName: "", reason: "" };

function reasonOf(error: unknown): string {
  return error instanceof ApiError ? String((error.details as { reason?: string } | undefined)?.reason ?? "") : "";
}

/** A decision that lost a race (already decided, expired, gone): the page reloads so it shows what is true now. */
const STALE = new Set(["NOT_PENDING", "EXPIRED", "NOT_FOUND", "ALREADY_PENDING"]);

/**
 * /admin/wallets/card-account — the company card members pay into by card-to-card. Everyone with wallet.view sees it
 * masked with its history; only a SUPER_ADMIN with settings.manage can propose a new one or switch it off (reason
 * required, every super admin is notified). BO-14: a proposal is not used until a different super admin approves it;
 * its proposer never sees Approve, only Withdraw.
 */
export function AdminCardAccountView() {
  const t = useTranslations("adminCardAccount");
  const locale = useLocale() as RouteLocale;
  const [data, setData] = useState<AdminCardTransferDestinationOverviewDto | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const [offReason, setOffReason] = useState("");
  const [approveChecked, setApproveChecked] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<"save" | "off" | "approve" | "reject" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const date = useCallback(
    (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso)) : "—"),
    [locale],
  );

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await adminWalletsService.cardDestination());
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, []);
  useEffect(() => void load(), [load]);

  function failure(error: unknown) {
    const reason = reasonOf(error);
    setMessage({ ok: false, text: t.has(`errors.${reason}`) ? t(`errors.${reason}` as "errors.CONFIRM") : t("errors.generic") });
    if (STALE.has(reason)) void load();
  }

  async function save() {
    if (form.reason.trim().length < 10) return setMessage({ ok: false, text: t("errors.REASON_TOO_SHORT") });
    if (!confirmed) return setMessage({ ok: false, text: t("errors.CONFIRM") });
    setBusy("save");
    setMessage(null);
    try {
      setData(
        await adminWalletsService.changeCardDestination({
          cardNumber: form.cardNumber.trim() || undefined,
          sheba: form.sheba.trim() || undefined,
          holderName: form.holderName.trim(),
          bankName: form.bankName.trim() || undefined,
          reason: form.reason.trim(),
        }),
      );
      setForm(EMPTY);
      setConfirmed(false);
      setMessage({ ok: true, text: t("saved") });
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  }

  async function approve(pending: AdminCardTransferDestinationPendingDto) {
    if (!approveChecked) return setMessage({ ok: false, text: t("errors.CONFIRM_APPROVE") });
    setBusy("approve");
    setMessage(null);
    try {
      setData(await adminWalletsService.approveCardDestination(pending.id));
      setApproveChecked(false);
      setMessage({ ok: true, text: t("pending.approved") });
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  }

  async function reject(pending: AdminCardTransferDestinationPendingDto) {
    if (rejectReason.trim().length < 10) return setMessage({ ok: false, text: t("errors.REASON_TOO_SHORT") });
    setBusy("reject");
    setMessage(null);
    try {
      setData(await adminWalletsService.rejectCardDestination(pending.id, rejectReason.trim()));
      setRejectReason("");
      setMessage({ ok: true, text: pending.requestedByMe ? t("pending.withdrawn") : t("pending.rejected") });
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  }

  async function switchOff() {
    if (offReason.trim().length < 10) return setMessage({ ok: false, text: t("errors.REASON_TOO_SHORT") });
    setBusy("off");
    setMessage(null);
    try {
      setData(await adminWalletsService.deactivateCardDestination(offReason.trim()));
      setOffReason("");
      setMessage({ ok: true, text: t("switchedOff") });
    } catch {
      setMessage({ ok: false, text: t("errors.generic") });
    } finally {
      setBusy(null);
    }
  }

  if (failed === "forbidden") return <section className="gx-card" role="alert"><h1>{t("title")}</h1><p className="gx-muted">{t("forbidden")}</p></section>;
  if (failed) return <section className="gx-card" role="alert"><h1>{t("title")}</h1><p className="gx-muted">{t("failed")}</p><button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button></section>;
  if (!data) return <p className="gx-muted">{t("loading")}</p>;

  const pending = data.pending;

  const field = (key: keyof typeof EMPTY, label: string, dir: "ltr" | "auto" = "auto") => (
    <label className="gx-field" key={key}>
      <span>{label}</span>
      <input dir={dir} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  );

  const ended = (row: AdminCardTransferDestinationDto) => {
    if (row.status === "ACTIVE" || row.status === "PENDING") return "—";
    if (row.status === "EXPIRED") return date(row.expiresAt);
    return `${row.closedBy ?? "—"} · ${date(row.closedAt)}${row.closeReason ? ` · ${row.closeReason}` : ""}`;
  };

  return (
    <div className="aw-list">
      <header className="gx-head">
        <div>
          <p className="gx-kicker"><Wallet size={16} aria-hidden="true" />{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>

      <section className="gx-card" aria-labelledby="card-account-current">
        <h2 id="card-account-current">{t("current")}</h2>
        <p className="gx-muted">{t(`source.${data.source}`)}</p>
        {data.current ? (
          <dl className="gx-grid aw-two">
            {data.current.cardNumberMasked ? <div><dt>{t("fields.cardNumber")}</dt><dd dir="ltr">{data.current.cardNumberMasked}</dd></div> : null}
            {data.current.shebaMasked ? <div><dt>{t("fields.sheba")}</dt><dd dir="ltr">{data.current.shebaMasked}</dd></div> : null}
            <div><dt>{t("fields.holderName")}</dt><dd>{data.current.holderName}</dd></div>
            {data.current.bankName ? <div><dt>{t("fields.bankName")}</dt><dd>{data.current.bankName}</dd></div> : null}
          </dl>
        ) : null}
        {!data.canEdit ? <p className="gx-muted">{t("readOnly")}</p> : null}
      </section>

      {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "gx-muted" : "aw-error"}>{message.text}</p> : null}

      {pending ? (
        <section className="gx-card" aria-labelledby="card-account-pending">
          <h2 id="card-account-pending">{t("pending.title")}</h2>
          <p className="gx-muted">{t("pending.hint")}</p>
          <dl className="gx-grid aw-two">
            {pending.cardNumberMasked ? <div><dt>{t("fields.cardNumber")}</dt><dd dir="ltr">{pending.cardNumberMasked}</dd></div> : null}
            {pending.shebaMasked ? <div><dt>{t("fields.sheba")}</dt><dd dir="ltr">{pending.shebaMasked}</dd></div> : null}
            <div><dt>{t("fields.holderName")}</dt><dd>{pending.holderName}</dd></div>
            {pending.bankName ? <div><dt>{t("fields.bankName")}</dt><dd>{pending.bankName}</dd></div> : null}
            <div><dt>{t("pending.requestedBy")}</dt><dd>{pending.requestedBy ?? "—"} · {date(pending.requestedAt)}</dd></div>
            <div><dt>{t("pending.expiresAt")}</dt><dd>{date(pending.expiresAt)}</dd></div>
            <div><dt>{t("columns.reason")}</dt><dd>{pending.reason}</dd></div>
          </dl>
          {pending.requestedByMe ? <p className="gx-muted">{t("pending.yours")}</p> : null}
          {pending.canApprove ? (
            <div className="aw-form">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={approveChecked} onChange={(e) => setApproveChecked(e.target.checked)} /> {t("pending.confirm")}
              </label>
              <button type="button" className="gx-btn gx-btn--primary" disabled={busy !== null} onClick={() => void approve(pending)}>
                {busy === "approve" ? t("pending.approving") : t("pending.approve")}
              </button>
            </div>
          ) : null}
          {pending.canReject ? (
            <div className="aw-form">
              <label className="gx-field">
                <span>{pending.requestedByMe ? t("pending.withdrawReason") : t("pending.rejectReason")}</span>
                <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </label>
              <button type="button" className="gx-btn" disabled={busy !== null} onClick={() => void reject(pending)}>
                {busy === "reject" ? t("saving") : pending.requestedByMe ? t("pending.withdraw") : t("pending.reject")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {data.canEdit ? (
        <section className="gx-card" aria-labelledby="card-account-change">
          <h2 id="card-account-change">{t("change")}</h2>
          <p className="gx-muted">{t("changeHint", { hours: data.approvalWindowHours })}</p>
          {pending ? (
            <p className="gx-muted">{t("pendingBlocksChange")}</p>
          ) : (
            <div className="aw-form">
              {field("cardNumber", t("fields.cardNumber"), "ltr")}
              {field("sheba", t("fields.sheba"), "ltr")}
              {field("holderName", t("fields.holderName"))}
              {field("bankName", t("fields.bankName"))}
              {field("reason", t("fields.reason"))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> {t("confirm")}
              </label>
              <button type="button" className="gx-btn gx-btn--primary" disabled={busy !== null} onClick={() => void save()}>
                {busy === "save" ? t("saving") : t("save")}
              </button>
            </div>
          )}
          {data.source === "ADMIN" ? (
            <div className="aw-form">
              <label className="gx-field">
                <span>{t("offReason")}</span>
                <input value={offReason} onChange={(e) => setOffReason(e.target.value)} />
              </label>
              <button type="button" className="gx-btn" disabled={busy !== null} onClick={() => void switchOff()}>
                {busy === "off" ? t("saving") : t("switchOff")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="gx-card" aria-labelledby="card-account-history">
        <h2 id="card-account-history">{t("history")}</h2>
        {data.history.length === 0 ? (
          <p className="gx-muted">{t("noHistory")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("fields.cardNumber")}</th>
                  <th>{t("fields.holderName")}</th>
                  <th>{t("columns.status")}</th>
                  <th>{t("columns.setBy")}</th>
                  <th>{t("columns.approvedBy")}</th>
                  <th>{t("columns.reason")}</th>
                  <th>{t("columns.closed")}</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">{row.cardNumberMasked ?? row.shebaMasked ?? "—"}</td>
                    <td>{row.holderName}</td>
                    <td><span className={`gx-tag aw-status aw-status--${row.status}`}>{t(`status.${row.status}`)}</span></td>
                    <td>{row.createdBy ?? "—"} · {date(row.createdAt)}</td>
                    <td>{row.approvedBy ? `${row.approvedBy} · ${date(row.approvedAt)}` : "—"}</td>
                    <td>{row.reason}</td>
                    <td>{ended(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
