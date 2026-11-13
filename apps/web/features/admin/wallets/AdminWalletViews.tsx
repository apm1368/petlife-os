"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type {
  AdminWalletAdjustmentRequestDto,
  AdminWalletDetailDto,
  AdminWalletListItemDto,
  AdminWalletTopUpDto,
  PaginatedDto,
  WalletAdjustmentDirectionValue,
  WalletAdjustmentReasonCode,
  WalletAdjustmentRequestStatusValue,
  WalletBalanceTypeValue,
  WalletTopUpStatusValue,
} from "@petlife/types";
import { Dialog, Search, Wallet } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminWalletsService } from "@/services/admin-wallets.service";
import { useAdminStore } from "@/stores/admin-store";
import { refreshQueues } from "../admin-queues";
import "./admin-wallets.css";

const REASON_CODES: WalletAdjustmentReasonCode[] = ["GOODWILL", "SERVICE_RECOVERY", "PAYMENT_CORRECTION", "REFUND_OUTSIDE_SYSTEM", "DUPLICATE_CREDIT_REVERSAL", "OTHER"];
const TOP_UP_FILTERS: (WalletTopUpStatusValue | "ALL")[] = ["REVIEW_PENDING", "AWAITING_RECEIPT", "CREDITED", "REJECTED", "EXPIRED", "ALL"];
const REQUEST_FILTERS: (WalletAdjustmentRequestStatusValue | "ALL")[] = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "ALL"];

function useMoney() {
  const locale = useLocale() as RouteLocale;
  return useCallback((rial: number) => formatCurrency(rial, locale), [locale]);
}

function useDate() {
  const locale = useLocale() as RouteLocale;
  return useCallback(
    (iso: string | null) =>
      iso
        ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso))
        : "—",
    [locale],
  );
}

function usePermissions() {
  const context = useAdminStore((s) => s.context);
  return { ready: !!context, has: (p: string) => !!context?.permissions?.includes(p as never) };
}

function reasonOf(error: unknown): string {
  return error instanceof ApiError ? String((error.details as { reason?: string } | undefined)?.reason ?? "") : "";
}

/** The API's own code for a refused decision (self-approval, expired, already decided), else the validation reason. */
function decisionErrorOf(error: unknown): string {
  if (!(error instanceof ApiError)) return "";
  return error.code === "VALIDATION_ERROR" ? reasonOf(error) : error.code;
}

/** Toman typed by staff (Persian or Latin digits) → integer rials, or null. */
function tomanToRial(raw: string): number | null {
  const latin = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬،]/g, "");
  if (!/^\d{1,12}$/.test(latin)) return null;
  return Number(latin) * 10;
}

function Forbidden() {
  const t = useTranslations("adminWallets");
  return (
    <section className="gx-card" role="alert">
      <h1>{t("title")}</h1>
      <p className="gx-muted">{t("forbidden")}</p>
    </section>
  );
}

function Head({ title, subtitle }: { title: string; subtitle: string }) {
  const t = useTranslations("adminWallets");
  return (
    <header className="gx-head">
      <div>
        <p className="gx-kicker">
          <Wallet size={16} aria-hidden="true" />
          {t("kicker")}
        </p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

/** /admin/wallets — every member's wallet; search reaches members whose wallet is still empty. */
export function AdminWalletsView() {
  const t = useTranslations("adminWallets");
  const locale = useLocale();
  const money = useMoney();
  const date = useDate();
  const perms = usePermissions();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminWalletListItemDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    setData(null);
    try {
      setData(await adminWalletsService.list(query || undefined, page));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (perms.ready && !perms.has("wallet.view")) return <Forbidden />;
  if (failed === "forbidden") return <Forbidden />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="gx-page">
      <Head title={t("title")} subtitle={t("subtitle")} />
      <section className="gx-card">
        <form
          className="gx-toolbar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <label className="gx-field aw-search">
            <span>{t("search")}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button type="submit" className="gx-btn">
            <Search size={16} aria-hidden="true" />
            {t("search")}
          </button>
        </form>
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert">
            <p>{t("failed")}</p>
            <button type="button" className="gx-btn" onClick={() => void load()}>
              {t("retry")}
            </button>
          </div>
        ) : !data ? (
          <div className="gx-skel" style={{ height: 220 }} aria-label={t("loading")} />
        ) : data.items.length === 0 ? (
          <p className="gx-empty">{query ? t("emptySearch") : t("empty")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("columns.member")}</th>
                  <th>{t("columns.contact")}</th>
                  <th className="gx-num">{t("columns.purchaseOnly")}</th>
                  <th className="gx-num">{t("columns.withdrawable")}</th>
                  <th className="gx-num">{t("columns.total")}</th>
                  <th>{t("columns.lastActivity")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.userId}>
                    <td>{row.displayName ?? "—"}</td>
                    <td dir="ltr" className="aw-contact">
                      {row.phone ?? row.email ?? "—"}
                    </td>
                    <td className="gx-num">{money(row.balances.purchaseOnly)}</td>
                    <td className="gx-num">{money(row.balances.withdrawable)}</td>
                    <td className="gx-num">
                      <strong>{money(row.balances.total)}</strong>
                    </td>
                    <td>{row.lastActivityAt ? date(row.lastActivityAt) : t("never")}</td>
                    <td>
                      <Link className="gx-btn" href={`/${locale}/admin/wallets/${row.userId}`}>
                        {t("open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 ? (
          <nav className="gx-toolbar aw-pager" aria-label={t("pageOf", { page, pages })}>
            <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("previous")}
            </button>
            <span className="gx-muted">{t("pageOf", { page, pages })}</span>
            <button type="button" className="gx-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {t("next")}
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

/** /admin/wallets/[userId] — balances, the correction form, history, top-ups, corrections and their audit trail. */
export function AdminWalletDetailView({ userId }: { userId: string }) {
  const t = useTranslations("adminWallets");
  const locale = useLocale();
  const money = useMoney();
  const date = useDate();
  const perms = usePermissions();
  const [data, setData] = useState<AdminWalletDetailDto | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await adminWalletsService.detail(userId));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if ((perms.ready && !perms.has("wallet.view")) || failed === "forbidden") return <Forbidden />;
  if (failed === "error")
    return (
      <div className="gx-inline-alert" role="alert">
        <p>{t("failed")}</p>
        <button type="button" className="gx-btn" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!data) return <div className="gx-skel" style={{ height: 320 }} aria-label={t("loading")} />;

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker">
            <Wallet size={16} aria-hidden="true" />
            <Link href={`/${locale}/admin/wallets`}>{t("detail.back")}</Link>
          </p>
          <h1>{data.user.displayName ?? "—"}</h1>
          <p>
            <span dir="ltr">{data.user.phone ?? data.user.email ?? ""}</span>
            {data.user.phone || data.user.email ? " · " : ""}
            {t("detail.memberSince", { date: date(data.user.createdAt) })}
          </p>
        </div>
        {perms.has("customer.view") ? (
          <Link className="gx-btn" href={`/${locale}/admin/customers/${data.user.id}`}>
            {t("detail.openCustomer")}
          </Link>
        ) : null}
      </header>

      <div className="gx-grid gx-grid--kpi">
        <div className="gx-kpi gx-kpi--accent">
          <span className="gx-kpi__label">{t("columns.total")}</span>
          <span className="gx-kpi__value">{money(data.balances.total)}</span>
        </div>
        <div className="gx-kpi">
          <span className="gx-kpi__label">{t("columns.purchaseOnly")}</span>
          <span className="gx-kpi__value">{money(data.balances.purchaseOnly)}</span>
        </div>
        <div className="gx-kpi">
          <span className="gx-kpi__label">{t("columns.withdrawable")}</span>
          <span className="gx-kpi__value">{money(data.balances.withdrawable)}</span>
        </div>
      </div>

      {notice ? (
        <p className="gx-inline-note" role="status">
          {notice}
        </p>
      ) : null}
      {perms.has("wallet.adjust") ? (
        <AdjustForm
          userId={userId}
          onSaved={() => {
            setNotice(t("adjust.done"));
            void load();
            void refreshQueues(true);
          }}
        />
      ) : (
        <p className="gx-inline-note">{t("adjust.noPermission")}</p>
      )}

      <section className="gx-card">
        <header>
          <h2>{t("requests.detailTitle")}</h2>
          <p>{t("requests.subtitle")}</p>
        </header>
        {data.adjustmentRequests.length === 0 ? (
          <p className="gx-empty">{t("requests.empty")}</p>
        ) : (
          <AdjustmentRequestList
            rows={data.adjustmentRequests}
            showMember={false}
            onDecided={(message) => {
              setNotice(message);
              void load();
              void refreshQueues(true);
            }}
          />
        )}
      </section>

      <section className="gx-card">
        <header>
          <h2>{t("detail.entries")}</h2>
        </header>
        {data.entries.length === 0 ? (
          <p className="gx-empty">{t("detail.entriesEmpty")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{t(`entry.purpose.${e.purpose}`)}</td>
                    <td>{t(`entry.bucket.${e.balanceType}`)}</td>
                    <td>{e.note && t.has(`entry.reasons.${e.note}`) ? t(`entry.reasons.${e.note}`) : ""}</td>
                    <td>{date(e.createdAt)}</td>
                    <td className="gx-num" dir="ltr">
                      {e.signedAmount >= 0 ? "+" : "−"}
                      {money(Math.abs(e.signedAmount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="gx-grid aw-two">
        <section className="gx-card">
          <header>
            <h2>{t("detail.topUps")}</h2>
          </header>
          {data.topUps.length === 0 ? (
            <p className="gx-empty">{t("detail.topUpsEmpty")}</p>
          ) : (
            <ul className="aw-list">
              {data.topUps.map((row) => (
                <li key={row.id}>
                  <span>
                    <strong>{money(row.amount)}</strong> · {t(`topUps.rails.${row.rail}`)}
                  </span>
                  <span className={`gx-tag aw-status aw-status--${row.status}`}>{t(`topUps.status.${row.status}`)}</span>
                  <small>{date(row.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="gx-card">
          <header>
            <h2>{t("detail.adjustments")}</h2>
          </header>
          {data.adjustments.length === 0 ? (
            <p className="gx-empty">{t("detail.adjustmentsEmpty")}</p>
          ) : (
            <ul className="aw-list">
              {data.adjustments.map((a) => (
                <li key={a.id}>
                  <span>
                    <strong dir="ltr">
                      {a.direction === "CREDIT" ? "+" : "−"}
                      {money(a.amount)}
                    </strong>{" "}
                    · {t(`adjust.buckets.${a.balanceType}`)} · {t(`adjust.reasonCodes.${a.reasonCode}`)}
                  </span>
                  <span>{a.reason}</span>
                  <small>
                    {t("detail.by", { name: a.createdBy.displayName ?? "—" })}
                    {a.approvedBy ? ` · ${t("detail.approvedBy", { name: a.approvedBy.displayName ?? "—" })}` : ""} · {date(a.createdAt)}
                    {a.evidenceReference ? ` · ${a.evidenceReference}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="gx-card">
        <header>
          <h2>{t("detail.audit")}</h2>
        </header>
        {data.audit.length === 0 ? (
          <p className="gx-empty">{t("detail.auditEmpty")}</p>
        ) : (
          <ul className="aw-list">
            {data.audit.map((a) => (
              <li key={a.id}>
                <span>
                  <strong>{t.has(`audit.${a.action.replace(/\./g, "_")}`) ? t(`audit.${a.action.replace(/\./g, "_")}`) : a.action}</strong>
                  {a.reason ? ` · ${a.reason}` : ""}
                </span>
                <small>
                  {t("detail.by", { name: a.adminDisplayName ?? "—" })} · {date(a.createdAt)}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AdjustForm({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const t = useTranslations("adminWallets");
  const money = useMoney();
  const [direction, setDirection] = useState<WalletAdjustmentDirectionValue>("CREDIT");
  const [bucket, setBucket] = useState<WalletBalanceTypeValue>("PURCHASE_ONLY");
  const [amountText, setAmountText] = useState("");
  const [reasonCode, setReasonCode] = useState<WalletAdjustmentReasonCode>("GOODWILL");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  const amount = tomanToRial(amountText);

  function check(): boolean {
    if (!amount || amount <= 0) {
      setError(t("adjust.errors.amount"));
      return false;
    }
    if (reason.trim().length < 5) {
      setError(t("adjust.errors.reasonTooShort"));
      return false;
    }
    setError(null);
    return true;
  }

  async function save() {
    if (!amount) return;
    setBusy(true);
    try {
      await adminWalletsService.requestAdjustment(userId, { direction, balanceType: bucket, amount, reasonCode, reason: reason.trim(), evidenceReference: evidence.trim() || undefined }, key.current);
      key.current = crypto.randomUUID();
      setAmountText("");
      setReason("");
      setEvidence("");
      setConfirming(false);
      onSaved();
    } catch (err) {
      const r = reasonOf(err);
      setError(t.has(`adjust.errors.${r}`) ? t(`adjust.errors.${r}`) : t("adjust.errors.generic"));
      setConfirming(false);
      key.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gx-card">
      <header>
        <h2>{t("adjust.title")}</h2>
        <p>{t("adjust.hint")}</p>
      </header>
      <form
        className="aw-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (check()) setConfirming(true);
        }}
      >
        <div className="aw-form__row">
          <div className="gx-field">
            <span>{t("adjust.direction")}</span>
            <div className="gx-seg" role="radiogroup" aria-label={t("adjust.direction")}>
              {(["CREDIT", "DEBIT"] as const).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}>
                  {t(`adjust.directions.${d}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="gx-field">
            <span>{t("adjust.bucket")}</span>
            <select value={bucket} onChange={(e) => setBucket(e.target.value as WalletBalanceTypeValue)}>
              {(["PURCHASE_ONLY", "WITHDRAWABLE"] as const).map((b) => (
                <option key={b} value={b}>
                  {t(`adjust.buckets.${b}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="gx-field">
            <span>{t("adjust.amount")}</span>
            <input inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </label>
          <label className="gx-field">
            <span>{t("adjust.reasonCode")}</span>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value as WalletAdjustmentReasonCode)}>
              {REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(`adjust.reasonCodes.${code}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="gx-field">
          <span>{t("adjust.reason")}</span>
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="gx-field">
          <span>{t("adjust.evidence")}</span>
          <input value={evidence} maxLength={200} onChange={(e) => setEvidence(e.target.value)} />
        </label>
        {error ? (
          <p className="aw-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="gx-toolbar">
          <button type="submit" className="gx-btn gx-btn--primary">
            {t("adjust.submit")}
          </button>
        </div>
      </form>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title={t("adjust.confirmTitle")}>
        <p>{t("adjust.confirm", { direction: t(`adjust.directions.${direction}`), amount: money(amount ?? 0), bucket: t(`adjust.buckets.${bucket}`) })}</p>
        <div className="gx-toolbar aw-dialog-actions">
          <button type="button" className="gx-btn gx-btn--primary" disabled={busy} onClick={() => void save()}>
            {busy ? t("adjust.saving") : t("adjust.confirmYes")}
          </button>
          <button type="button" className="gx-btn" onClick={() => setConfirming(false)}>
            {t("adjust.cancel")}
          </button>
        </div>
      </Dialog>
    </section>
  );
}

/**
 * Correction requests (FE-16), on the queue page and on a member's wallet. Anyone with wallet.adjust may reject a
 * pending request with a reason; approving is offered only on requests someone else made (the API refuses the rest).
 */
function AdjustmentRequestList({ rows, showMember, onDecided }: { rows: AdminWalletAdjustmentRequestDto[]; showMember: boolean; onDecided: (message: string) => void }) {
  const t = useTranslations("adminWallets");
  const locale = useLocale();
  const money = useMoney();
  const date = useDate();
  const perms = usePermissions();
  const me = useAdminStore((s) => s.context?.adminUserId ?? null);
  const canDecide = perms.has("wallet.adjust");
  const [deciding, setDeciding] = useState<{ row: AdminWalletAdjustmentRequestDto; mode: "approve" | "reject" } | null>(null);

  return (
    <>
      <ul className="aw-list">
        {rows.map((row) => {
          const mine = me !== null && row.requestedBy.adminUserId === me;
          return (
            <li key={row.id} aria-label={t("requests.itemLabel", { amount: money(row.amount), name: row.requestedBy.displayName ?? "—" })}>
              <span>
                <strong dir="ltr">
                  {row.direction === "CREDIT" ? "+" : "−"}
                  {money(row.amount)}
                </strong>{" "}
                · {t(`adjust.buckets.${row.balanceType}`)} · {t(`adjust.reasonCodes.${row.reasonCode}`)}
                {showMember ? (
                  <>
                    {" · "}
                    <Link href={`/${locale}/admin/wallets/${row.userId}`}>{row.userDisplayName ?? "—"}</Link>
                  </>
                ) : null}
              </span>
              <span>
                {row.reason}
                {row.evidenceReference ? ` · ${row.evidenceReference}` : ""}
              </span>
              <small>
                {t("requests.requestedBy", { name: row.requestedBy.displayName ?? "—" })} · {date(row.createdAt)}
                {row.status === "PENDING" ? ` · ${t("requests.expires", { date: date(row.expiresAt) })}` : ""}
                {row.decidedBy ? ` · ${t("requests.decidedBy", { name: row.decidedBy.displayName ?? "—" })}` : ""}
                {row.decisionReason ? ` · ${row.decisionReason}` : ""}
              </small>
              <div className="gx-toolbar aw-request-actions">
                <span className={`gx-tag aw-status aw-status--${row.status}`}>{t(`requests.status.${row.status}`)}</span>
                {row.status === "PENDING" && canDecide ? (
                  <>
                    {mine ? (
                      <small>{t("requests.yours")}</small>
                    ) : (
                      <button type="button" className="gx-btn gx-btn--primary" onClick={() => setDeciding({ row, mode: "approve" })}>
                        {t("requests.approve")}
                      </button>
                    )}
                    <button type="button" className="gx-btn" onClick={() => setDeciding({ row, mode: "reject" })}>
                      {t("requests.reject")}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {deciding ? (
        <DecideDialog
          row={deciding.row}
          mode={deciding.mode}
          onClose={() => setDeciding(null)}
          onDone={(message) => {
            setDeciding(null);
            onDecided(message);
          }}
        />
      ) : null}
    </>
  );
}

function DecideDialog({ row, mode, onClose, onDone }: { row: AdminWalletAdjustmentRequestDto; mode: "approve" | "reject"; onClose: () => void; onDone: (message: string) => void }) {
  const t = useTranslations("adminWallets");
  const money = useMoney();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide() {
    if (mode === "reject" && reason.trim().length < 5) {
      setError(t("requests.errors.reasonTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "approve") await adminWalletsService.approveAdjustment(row.id);
      else await adminWalletsService.rejectAdjustment(row.id, reason.trim());
      onDone(mode === "approve" ? t("requests.approved") : t("requests.rejected"));
    } catch (err) {
      const code = decisionErrorOf(err);
      setError(t.has(`requests.errors.${code}`) ? t(`requests.errors.${code}`) : t("requests.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={mode === "approve" ? t("requests.approveTitle") : t("requests.rejectTitle")}>
      <div className="aw-form">
        <p>
          {t("requests.summary", {
            direction: t(`adjust.directions.${row.direction}`),
            amount: money(row.amount),
            bucket: t(`adjust.buckets.${row.balanceType}`),
            member: row.userDisplayName ?? "—",
          })}
        </p>
        <p className="gx-muted">
          {row.reason}
          {row.evidenceReference ? ` · ${row.evidenceReference}` : ""}
        </p>
        <p>{mode === "approve" ? t("requests.approveWarning") : t("requests.rejectWarning")}</p>
        {mode === "reject" ? (
          <label className="gx-field">
            <span>{t("requests.rejectReason")}</span>
            <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
        ) : null}
        {error ? (
          <p className="aw-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="gx-toolbar aw-dialog-actions">
          <button type="button" className="gx-btn gx-btn--primary" disabled={busy} onClick={() => void decide()}>
            {mode === "approve" ? t("requests.confirmApprove") : t("requests.confirmReject")}
          </button>
          <button type="button" className="gx-btn" onClick={onClose}>
            {t("requests.cancel")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** /admin/wallets/adjustments — corrections waiting for a second admin (FE-16), oldest first; decided ones by filter. */
export function AdminWalletAdjustmentRequestsView() {
  const t = useTranslations("adminWallets");
  const perms = usePermissions();
  const [status, setStatus] = useState<WalletAdjustmentRequestStatusValue | "ALL">("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminWalletAdjustmentRequestDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await adminWalletsService.adjustmentRequests({ status: status === "ALL" ? undefined : status, page }));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if ((perms.ready && !perms.has("wallet.view")) || failed === "forbidden") return <Forbidden />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="gx-page">
      <Head title={t("requests.title")} subtitle={t("requests.subtitle")} />
      {notice ? (
        <p className="gx-inline-note" role="status">
          {notice}
        </p>
      ) : null}
      <section className="gx-card">
        <div className="gx-seg" role="radiogroup" aria-label={t("requests.filter")}>
          {REQUEST_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
                setData(null);
              }}
            >
              {s === "ALL" ? t("requests.all") : t(`requests.status.${s}`)}
            </button>
          ))}
        </div>
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert">
            <p>{t("failed")}</p>
            <button type="button" className="gx-btn" onClick={() => void load()}>
              {t("retry")}
            </button>
          </div>
        ) : !data ? (
          <div className="gx-skel" style={{ height: 200 }} aria-label={t("loading")} />
        ) : data.items.length === 0 ? (
          <p className="gx-empty">{t("requests.empty")}</p>
        ) : (
          <AdjustmentRequestList
            rows={data.items}
            showMember
            onDecided={(message) => {
              setNotice(message);
              void load();
              void refreshQueues(true);
            }}
          />
        )}
        {data && pages > 1 ? (
          <nav className="gx-toolbar aw-pager" aria-label={t("pageOf", { page, pages })}>
            <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("previous")}
            </button>
            <span className="gx-muted">{t("pageOf", { page, pages })}</span>
            <button type="button" className="gx-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {t("next")}
            </button>
          </nav>
        ) : null}
        {perms.ready && !perms.has("wallet.adjust") ? <p className="gx-muted">{t("requests.noPermission")}</p> : null}
      </section>
    </div>
  );
}

/** /admin/wallets/top-ups — card-to-card receipts. Finance confirms what actually arrived; that amount is credited. */
export function AdminWalletTopUpsView() {
  const t = useTranslations("adminWallets");
  const money = useMoney();
  const date = useDate();
  const perms = usePermissions();
  const [status, setStatus] = useState<WalletTopUpStatusValue | "ALL">("REVIEW_PENDING");
  const [data, setData] = useState<PaginatedDto<AdminWalletTopUpDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [reviewing, setReviewing] = useState<AdminWalletTopUpDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    setData(null);
    try {
      setData(await adminWalletsService.topUps(status === "ALL" ? undefined : status));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  if ((perms.ready && !perms.has("wallet.view")) || failed === "forbidden") return <Forbidden />;
  const canReview = perms.has("wallet.topup.review");

  return (
    <div className="gx-page">
      <Head title={t("topUps.title")} subtitle={t("topUps.subtitle")} />
      {notice ? (
        <p className="gx-inline-note" role="status">
          {notice}
        </p>
      ) : null}
      <section className="gx-card">
        <div className="gx-seg" role="radiogroup" aria-label={t("topUps.filter")}>
          {TOP_UP_FILTERS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)}>
              {s === "ALL" ? t("topUps.all") : t(`topUps.status.${s}`)}
            </button>
          ))}
        </div>
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert">
            <p>{t("failed")}</p>
            <button type="button" className="gx-btn" onClick={() => void load()}>
              {t("retry")}
            </button>
          </div>
        ) : !data ? (
          <div className="gx-skel" style={{ height: 200 }} aria-label={t("loading")} />
        ) : data.items.length === 0 ? (
          <p className="gx-empty">{t("topUps.empty")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("topUps.columns.member")}</th>
                  <th className="gx-num">{t("topUps.columns.amount")}</th>
                  <th>{t("topUps.columns.rail")}</th>
                  <th>{t("topUps.columns.status")}</th>
                  <th>{t("topUps.columns.submitted")}</th>
                  <th>{t("topUps.columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.userDisplayName ?? "—"}</td>
                    <td className="gx-num">{money(row.amount)}</td>
                    <td>{t(`topUps.rails.${row.rail}`)}</td>
                    <td>
                      <span className={`gx-tag aw-status aw-status--${row.status}`}>{t(`topUps.status.${row.status}`)}</span>
                    </td>
                    <td>{date(row.receiptUploadedAt)}</td>
                    <td>
                      {row.status === "REVIEW_PENDING" && canReview ? (
                        <button type="button" className="gx-btn gx-btn--primary" onClick={() => setReviewing(row)}>
                          {t("topUps.review")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!canReview && perms.ready ? <p className="gx-muted">{t("topUps.noPermission")}</p> : null}
      </section>
      {reviewing ? (
        <ReviewDialog
          row={reviewing}
          onClose={() => setReviewing(null)}
          onDone={(message) => {
            setReviewing(null);
            setNotice(message);
            void load();
            void refreshQueues(true);
          }}
        />
      ) : null}
    </div>
  );
}

function ReviewDialog({ row, onClose, onDone }: { row: AdminWalletTopUpDto; onClose: () => void; onDone: (message: string) => void }) {
  const t = useTranslations("adminWallets");
  const money = useMoney();
  const [received, setReceived] = useState(String(row.amount / 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "receipt" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openReceipt() {
    setBusy("receipt");
    try {
      const link = await adminWalletsService.receiptLink(row.id);
      window.open(link.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(null);
    }
  }

  async function decide(approve: boolean) {
    const amount = tomanToRial(received);
    if (approve && (!amount || amount <= 0)) {
      setError(t("adjust.errors.amount"));
      return;
    }
    if (!approve && reason.trim().length < 5) {
      setError(t("adjust.errors.reasonTooShort"));
      return;
    }
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      await adminWalletsService.review(row.id, approve ? { approve, receivedAmount: amount ?? undefined } : { approve, reason: reason.trim(), receivedAmount: amount ?? 0 });
      onDone(approve ? t("topUps.approved") : t("topUps.rejected"));
    } catch {
      setError(t("topUps.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("topUps.reviewTitle")}>
      <div className="aw-form">
        <p>
          <strong>{row.userDisplayName ?? "—"}</strong> · {money(row.amount)}
          {row.cardNumberMasked ? (
            <>
              {" "}
              · <span dir="ltr">{row.cardNumberMasked}</span>
            </>
          ) : null}
        </p>
        <button type="button" className="gx-btn" disabled={busy !== null} onClick={() => void openReceipt()}>
          {busy === "receipt" ? t("topUps.receiptOpening") : t("topUps.viewReceipt")}
        </button>
        <label className="gx-field">
          <span>{t("topUps.receivedAmount")}</span>
          <input inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} />
        </label>
        <label className="gx-field">
          <span>{t("topUps.rejectReason")}</span>
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error ? (
          <p className="aw-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="gx-toolbar aw-dialog-actions">
          <button type="button" className="gx-btn gx-btn--primary" disabled={busy !== null} onClick={() => void decide(true)}>
            {t("topUps.approve")}
          </button>
          <button type="button" className="gx-btn" disabled={busy !== null} onClick={() => void decide(false)}>
            {t("topUps.reject")}
          </button>
          <button type="button" className="gx-btn" onClick={onClose}>
            {t("topUps.close")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
