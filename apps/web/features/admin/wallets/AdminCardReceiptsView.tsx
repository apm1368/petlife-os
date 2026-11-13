"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { AdminCardTransferPaymentDto, CardTransferPaymentStatusValue, PaginatedDto } from "@petlife/types";
import { Dialog, Wallet } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminWalletsService } from "@/services/admin-wallets.service";
import { useAdminStore } from "@/stores/admin-store";
import "./admin-wallets.css";

const FILTERS: (CardTransferPaymentStatusValue | "ALL")[] = ["REVIEW_PENDING", "UNDERPAID_AWAITING_DIFFERENCE", "AWAITING_RECEIPT", "APPROVED", "REJECTED", "EXPIRED", "ALL"];

function reasonOf(error: unknown): string {
  return error instanceof ApiError ? String((error.details as { reason?: string } | undefined)?.reason ?? "") : "";
}

/** Toman typed by staff (Persian or Latin digits) → integer rials, or null. */
function tomanToRial(raw: string): number | null {
  const latin = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬،]/g, "");
  return /^\d{1,12}$/.test(latin) ? Number(latin) * 10 : null;
}

/**
 * /admin/wallets/card-receipts — card-to-card receipts for orders and bookings. Pending receipts first, oldest first;
 * finance (finance.refund.execute) approves for the amount actually received or rejects with a reason, and the member
 * is told either way.
 */
export function AdminCardReceiptsView() {
  const t = useTranslations("adminCardReceipts");
  const locale = useLocale() as RouteLocale;
  const context = useAdminStore((s) => s.context);
  const canReview = !!context?.permissions?.includes("finance.refund.execute" as never);
  const [filter, setFilter] = useState<CardTransferPaymentStatusValue | "ALL">("REVIEW_PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminCardTransferPaymentDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [open, setOpen] = useState<AdminCardTransferPaymentDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const money = useCallback((rial: number) => formatCurrency(rial, locale), [locale]);
  const date = useCallback(
    (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso)) : "—"),
    [locale],
  );

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await adminWalletsService.cardReceipts(filter, page));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [filter, page]);
  useEffect(() => void load(), [load]);

  if (failed === "forbidden") return <section className="gx-card" role="alert"><h1>{t("title")}</h1><p className="gx-muted">{t("forbidden")}</p></section>;

  return (
    <div className="aw-list">
      <header className="gx-head">
        <div>
          <p className="gx-kicker"><Wallet size={16} aria-hidden="true" />{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      <div className="gx-toolbar" role="group" aria-label={t("filter")}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`gx-btn ${filter === f ? "gx-btn--primary" : ""}`} aria-pressed={filter === f} onClick={() => { setFilter(f); setPage(1); }}>
            {t(`status.${f}`)}
          </button>
        ))}
      </div>
      {notice ? <p role="status" className="gx-muted">{notice}</p> : null}
      {failed ? <p role="alert" className="aw-error">{t("failed")} <button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button></p> : null}
      {!data && !failed ? <p className="gx-muted">{t("loading")}</p> : null}
      {data && data.items.length === 0 ? <p className="gx-muted">{t("empty")}</p> : null}
      {data && data.items.length > 0 ? (
        <div className="gx-table-wrap">
          <table className="gx-table">
            <thead>
              <tr><th>{t("columns.member")}</th><th>{t("columns.reference")}</th><th>{t("columns.amount")}</th><th>{t("columns.uploaded")}</th><th>{t("columns.status")}</th><th>{" "}</th></tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.member.displayName ?? "—"}</td>
                  <td>{row.reference.kind === "BOOKING" ? t("reference.booking") : t("reference.order", { count: row.reference.orderIds.length })}</td>
                  <td>{money(row.expectedAmount)}</td>
                  <td>{date(row.receiptUploadedAt)}</td>
                  <td><span className={`gx-tag aw-status--${row.status}`}>{t(`status.${row.status}`)}</span></td>
                  <td><button type="button" className="gx-btn" onClick={() => setOpen(row)}>{t("open")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data && data.total > data.pageSize ? (
        <div className="aw-pager">
          <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("previous")}</button>
          <button type="button" className="gx-btn" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>{t("next")}</button>
        </div>
      ) : null}
      {open ? (
        <ReceiptDialog
          row={open}
          canReview={canReview}
          money={money}
          date={date}
          onClose={() => setOpen(null)}
          onDone={(text) => { setOpen(null); setNotice(text); void load(); }}
        />
      ) : null}
    </div>
  );
}

function ReceiptDialog({ row, canReview, money, date, onClose, onDone }: { row: AdminCardTransferPaymentDto; canReview: boolean; money: (rial: number) => string; date: (iso: string | null) => string; onClose: () => void; onDone: (text: string) => void }) {
  const t = useTranslations("adminCardReceipts");
  const locale = useLocale();
  const [received, setReceived] = useState(String(row.expectedAmount / 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "receipt" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reviewable = row.status === "REVIEW_PENDING";
  const notYet = reviewable && new Date(row.reviewAvailableAt) > new Date();

  async function openReceipt() {
    setBusy("receipt");
    try {
      const link = await adminWalletsService.cardReceiptLink(row.id);
      window.open(link.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(t("receiptFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function decide(approve: boolean) {
    const amount = tomanToRial(received);
    if (approve && (amount === null || amount <= 0)) return setError(t("errors.amount"));
    if (!approve && reason.trim().length < 5) return setError(t("errors.reason"));
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      const result = await adminWalletsService.reviewCardReceipt(row.id, approve ? { approve, receivedAmount: amount! } : { approve, receivedAmount: amount ?? 0, reason: reason.trim() });
      onDone(t(`done.${result.status === "UNDERPAID_AWAITING_DIFFERENCE" ? "UNDERPAID" : approve ? "APPROVED" : "REJECTED"}`));
    } catch (e) {
      const r = reasonOf(e);
      setError(r === "REVIEW_AVAILABLE_NEXT_WORKING_HOURS" ? t("errors.notYet") : r === "NOT_REVIEWABLE" ? t("errors.notReviewable") : t("errors.generic"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("reviewTitle")}>
      <div className="aw-form">
        <dl className="gx-grid aw-two">
          <div><dt>{t("columns.member")}</dt><dd>{row.member.displayName ?? "—"}</dd></div>
          <div><dt>{t("columns.amount")}</dt><dd>{money(row.expectedAmount)}{row.receivedAmount !== null ? ` · ${t("receivedSoFar", { amount: money(row.receivedAmount) })}` : ""}</dd></div>
          <div>
            <dt>{t("columns.reference")}</dt>
            <dd>
              {row.reference.kind === "BOOKING" && row.reference.bookingId ? <Link className="underline" href={`/${locale}/admin/services/bookings/${row.reference.bookingId}`}>{t("reference.booking")}</Link> : null}
              {row.reference.kind === "ORDER" ? row.reference.orderIds.map((id) => <Link key={id} className="underline" href={`/${locale}/admin/commerce/orders/${id}`}>{`#${id.slice(0, 8)}`} </Link>) : null}
            </dd>
          </div>
          <div><dt>{t("account")}</dt><dd><span dir="ltr">{row.companyCardNumberMasked}</span> · {row.accountHolderName}</dd></div>
          <div><dt>{t("columns.uploaded")}</dt><dd>{date(row.receiptUploadedAt)}</dd></div>
          {row.rejectionReason ? <div><dt>{t("rejectionReason")}</dt><dd>{row.rejectionReason}</dd></div> : null}
        </dl>
        {row.receiptUploaded ? (
          <button type="button" className="gx-btn" disabled={busy !== null} onClick={() => void openReceipt()}>{busy === "receipt" ? t("receiptOpening") : t("viewReceipt")}</button>
        ) : <p className="gx-muted">{t("noReceipt")}</p>}
        {notYet ? <p className="gx-muted">{t("availableAt", { date: date(row.reviewAvailableAt) })}</p> : null}
        {canReview && reviewable ? (
          <>
            <label className="gx-field">
              <span>{t("receivedAmount")}</span>
              <input inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} />
            </label>
            <label className="gx-field">
              <span>{t("reason")}</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="aw-dialog-actions gx-toolbar">
              <button type="button" className="gx-btn gx-btn--primary" disabled={busy !== null} onClick={() => void decide(true)}>{busy === "approve" ? t("saving") : t("approve")}</button>
              <button type="button" className="gx-btn" disabled={busy !== null} onClick={() => void decide(false)}>{busy === "reject" ? t("saving") : t("reject")}</button>
            </div>
          </>
        ) : !canReview ? <p className="gx-muted">{t("readOnly")}</p> : null}
        {error ? <p role="alert" className="aw-error">{error}</p> : null}
      </div>
    </Dialog>
  );
}
