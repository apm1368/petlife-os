"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  WALLET_TRANSFER_MAX_IRR,
  WALLET_TRANSFER_REASON_CODES,
  type AdminWalletAccountDetailDto,
  type AdminWalletAccountDto,
  type AdminWalletTransferDto,
  type PaginatedDto,
  type WalletAdjustmentRequestStatusValue,
  type WalletBalanceTypeValue,
  type WalletOwnerDto,
  type WalletOwnerTypeValue,
  type WalletTransferReasonCode,
} from "@petlife/types";
import { Search, Wallet } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminWalletsService } from "@/services/admin-wallets.service";
import { useAdminStore } from "@/stores/admin-store";
import "./admin-wallets.css";

const OWNER_TYPES: WalletOwnerTypeValue[] = ["SELLER", "PROVIDER", "MEMBER"];
const STATUS_FILTERS: (WalletAdjustmentRequestStatusValue | "ALL")[] = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "ALL"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Toman typed by staff (Persian or Latin digits) → integer rials, or null. */
function tomanToRial(raw: string): number | null {
  const latin = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬،]/g, "");
  if (!/^\d{1,11}$/.test(latin)) return null;
  return Number(latin) * 10;
}

function usePerms() {
  const context = useAdminStore((s) => s.context);
  return { ready: !!context, has: (p: string) => !!context?.permissions?.includes(p as never), me: context?.adminUserId ?? null };
}

function useFormat() {
  const locale = useLocale() as RouteLocale;
  const money = useCallback((rial: number) => formatCurrency(rial, locale), [locale]);
  const date = useCallback(
    (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso)) : "—"),
    [locale],
  );
  return { locale, money, date };
}

function errorText(t: ReturnType<typeof useTranslations>, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return t("transfers.errors.forbidden");
    const reason = String((error.details as { reason?: string } | undefined)?.reason ?? "");
    if (t.has(`transfers.errors.${error.code}`)) return t(`transfers.errors.${error.code}`);
    if (reason && t.has(`transfers.errors.${reason}`)) return t(`transfers.errors.${reason}`);
  }
  return t("transfers.errors.generic");
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

function Forbidden() {
  const t = useTranslations("adminWallets");
  return (
    <section className="gx-card" role="alert">
      <h1>{t("business.title")}</h1>
      <p className="gx-muted">{t("forbidden")}</p>
    </section>
  );
}

function OwnerLabel({ owner }: { owner: WalletOwnerDto }) {
  const t = useTranslations("adminWallets");
  const { locale } = useFormat();
  return (
    <span className="aw-owner">
      <Link href={`/${locale}/admin/wallets/accounts/${owner.walletAccountId}`}>{owner.name}</Link>
      <small>{t(`business.kind.${owner.type}`)}</small>
    </span>
  );
}

/** /admin/wallets/business — business wallets (one per seller/provider organisation) and member wallets, by owner. */
export function AdminBusinessWalletsView() {
  const t = useTranslations("adminWallets");
  const { locale, money, date } = useFormat();
  const perms = usePerms();
  const [type, setType] = useState<WalletOwnerTypeValue>("SELLER");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminWalletAccountDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    setData(null);
    try {
      setData(await adminWalletsService.accounts(type, query || undefined, page));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [type, query, page]);
  useEffect(() => void load(), [load]);

  if ((perms.ready && !perms.has("wallet.view")) || failed === "forbidden") return <Forbidden />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="gx-page">
      <Head title={t("business.title")} subtitle={t("business.subtitle")} />
      <section className="gx-card">
        <div className="gx-toolbar" role="tablist" aria-label={t("business.typeLabel")}>
          {OWNER_TYPES.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={type === k} className={`gx-btn ${type === k ? "gx-btn--primary" : ""}`} onClick={() => { setType(k); setPage(1); }}>
              {t(`business.kindPlural.${k}`)}
            </button>
          ))}
        </div>
        <form className="gx-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
          <label className="gx-field aw-search">
            <span>{t("business.search")}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={120} />
          </label>
          <button type="submit" className="gx-btn">
            <Search size={16} aria-hidden="true" />
            {t("business.searchButton")}
          </button>
          {perms.has("wallet.adjust") ? (
            <Link className="gx-btn gx-btn--primary" href={`/${locale}/admin/wallets/transfers?new=1`}>
              {t("transfers.new")}
            </Link>
          ) : null}
        </form>
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert">
            <p>{t("failed")}</p>
            <button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button>
          </div>
        ) : !data ? (
          <div className="gx-skel" style={{ height: 200 }} aria-label={t("loading")} />
        ) : data.items.length === 0 ? (
          <p className="gx-empty">{t("business.empty")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("business.columns.owner")}</th>
                  <th className="gx-num">{t("columns.purchaseOnly")}</th>
                  <th className="gx-num">{t("columns.withdrawable")}</th>
                  <th className="gx-num">{t("columns.total")}</th>
                  <th>{t("columns.lastActivity")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.owner.walletAccountId}>
                    <td><OwnerLabel owner={row.owner} /></td>
                    <td className="gx-num">{money(row.balances.purchaseOnly)}</td>
                    <td className="gx-num">{money(row.balances.withdrawable)}</td>
                    <td className="gx-num"><strong>{money(row.balances.total)}</strong></td>
                    <td>{row.lastActivityAt ? date(row.lastActivityAt) : t("never")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 ? (
          <nav className="gx-toolbar aw-pager" aria-label={t("pageOf", { page, pages })}>
            <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("previous")}</button>
            <span className="gx-muted">{t("pageOf", { page, pages })}</span>
            <button type="button" className="gx-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("next")}</button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

/** /admin/wallets/accounts/[id] — one wallet of any kind: balances, history, top-ups and transfers. */
export function AdminWalletAccountView({ id }: { id: string }) {
  const t = useTranslations("adminWallets");
  const { locale, money, date } = useFormat();
  const perms = usePerms();
  const [data, setData] = useState<AdminWalletAccountDetailDto | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await adminWalletsService.account(id));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  if ((perms.ready && !perms.has("wallet.view")) || failed === "forbidden") return <Forbidden />;
  if (failed === "error") {
    return (
      <div className="gx-inline-alert" role="alert">
        <p>{t("failed")}</p>
        <button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <div className="gx-skel" style={{ height: 320 }} aria-label={t("loading")} />;
  const owner = data.account.owner;
  const transferHref = (side: "from" | "to") => `/${locale}/admin/wallets/transfers?new=1&${side}Type=${owner.type}&${side}Id=${owner.ownerId}`;

  return (
    <div className="gx-page">
      <Head title={owner.name} subtitle={t(`business.kind.${owner.type}`)} />
      <section className="gx-card">
        <div className="gx-grid gx-grid--kpi">
          {(["total", "purchaseOnly", "withdrawable"] as const).map((k) => (
            <div key={k} className="gx-kpi">
              <span className="gx-kpi__label">{t(`columns.${k}`)}</span>
              <span className="gx-kpi__value">{money(data.account.balances[k])}</span>
            </div>
          ))}
        </div>
        <div className="gx-toolbar">
          {owner.type === "MEMBER" ? <Link className="gx-btn" href={`/${locale}/admin/wallets/${owner.ownerId}`}>{t("business.memberPage")}</Link> : null}
          {perms.has("wallet.adjust") ? (
            <>
              <Link className="gx-btn" href={transferHref("from")}>{t("business.transferFrom")}</Link>
              <Link className="gx-btn" href={transferHref("to")}>{t("business.transferTo")}</Link>
            </>
          ) : null}
        </div>
      </section>

      <section className="gx-card" aria-labelledby="aw-transfers">
        <h2 id="aw-transfers">{t("transfers.title")}</h2>
        {data.transfers.length === 0 ? <p className="gx-empty">{t("transfers.empty")}</p> : <TransferList rows={data.transfers} onChanged={load} />}
      </section>

      <section className="gx-card" aria-labelledby="aw-history">
        <h2 id="aw-history">{t("business.history")}</h2>
        {data.entries.length === 0 ? (
          <p className="gx-empty">{t("business.noHistory")}</p>
        ) : (
          <ul className="aw-list">
            {data.entries.map((e) => (
              <li key={e.id}>
                <strong dir="ltr">{e.signedAmount >= 0 ? "+" : "−"}{money(Math.abs(e.signedAmount))}</strong>
                <small>{t.has(`business.purpose.${e.purpose}`) ? t(`business.purpose.${e.purpose}`) : e.purpose} · {e.balanceType} · {date(e.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.topUps.length ? (
        <section className="gx-card" aria-labelledby="aw-topups">
          <h2 id="aw-topups">{t("business.topUps")}</h2>
          <ul className="aw-list">
            {data.topUps.map((row) => (
              <li key={row.id}>
                <strong>{money(row.receivedAmount ?? row.amount)} · <span className={`gx-tag aw-status aw-status--${row.status}`}>{row.status}</span></strong>
                <small>{row.rail} · {row.userDisplayName ?? "—"} · {date(row.createdAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Pending transfers first; approve / reject / reverse buttons follow wallet.adjust and the two-person rule. */
function TransferList({ rows, onChanged }: { rows: AdminWalletTransferDto[]; onChanged: () => void }) {
  const t = useTranslations("adminWallets");
  const { money, date } = useFormat();
  const perms = usePerms();
  const canAct = perms.has("wallet.adjust");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reversing, setReversing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setMessage(null);
    try {
      await action();
      setRejecting(null);
      setReversing(null);
      setReason("");
      setNote("");
      setEvidence("");
      onChanged();
    } catch (error) {
      setMessage({ id, text: errorText(t, error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="aw-list aw-transfers">
      {rows.map((row) => {
        const mine = perms.me !== null && row.requestedBy.adminUserId === perms.me;
        return (
          <li key={row.id}>
            <div className="aw-transfer__head">
              <strong>{money(row.amount)}</strong>
              <span className={`gx-tag aw-status aw-status--${row.status}`}>{t(`transfers.status.${row.status}`)}</span>
              {row.reversesTransferId ? <span className="gx-tag">{t("transfers.reversal")}</span> : null}
              {!row.related ? <span className="gx-tag aw-status aw-status--REJECTED">{t("transfers.unrelated")}</span> : null}
            </div>
            <div className="aw-transfer__route">
              <OwnerLabel owner={row.from} /> <span aria-hidden="true">→</span> <OwnerLabel owner={row.to} />
            </div>
            <small>
              {t(`transfers.reason.${row.reasonCode}`)} · {row.note} · {t("transfers.evidence")}: {row.evidenceReference}
            </small>
            <small>
              {t("transfers.requestedBy", { name: row.requestedBy.displayName, date: date(row.createdAt) })}
              {row.decidedBy ? ` · ${t("transfers.decidedBy", { name: row.decidedBy.displayName, date: date(row.decidedAt) })}` : ""}
              {row.status === "PENDING" ? ` · ${t("transfers.expires", { date: date(row.expiresAt) })}` : ""}
              {row.decisionReason ? ` · ${row.decisionReason}` : ""}
            </small>
            {canAct && row.status === "PENDING" ? (
              <div className="gx-toolbar aw-request-actions">
                {mine ? (
                  <span className="gx-muted">{t("transfers.waitingForSecond")}</span>
                ) : (
                  <button type="button" className="gx-btn gx-btn--primary" disabled={busy === row.id} onClick={() => void run(row.id, () => adminWalletsService.approveTransfer(row.id))}>
                    {t("transfers.approve")}
                  </button>
                )}
                {rejecting === row.id ? (
                  <form className="gx-toolbar" onSubmit={(e) => { e.preventDefault(); void run(row.id, () => adminWalletsService.rejectTransfer(row.id, reason.trim())); }}>
                    <label className="gx-field">
                      <span>{t("transfers.rejectReason")}</span>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} required />
                    </label>
                    <button type="submit" className="gx-btn" disabled={busy === row.id || reason.trim().length < 5}>{mine ? t("transfers.withdraw") : t("transfers.reject")}</button>
                  </form>
                ) : (
                  <button type="button" className="gx-btn" onClick={() => setRejecting(row.id)}>{mine ? t("transfers.withdraw") : t("transfers.reject")}</button>
                )}
              </div>
            ) : null}
            {canAct && row.status === "APPROVED" && !row.reversesTransferId && !row.reversalId ? (
              reversing === row.id ? (
                <form className="aw-form" onSubmit={(e) => { e.preventDefault(); void run(row.id, () => adminWalletsService.reverseTransfer(row.id, { note: note.trim(), evidenceReference: evidence.trim() })); }}>
                  <div className="aw-form__row">
                    <label className="gx-field"><span>{t("transfers.note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} minLength={5} maxLength={1000} required /></label>
                    <label className="gx-field"><span>{t("transfers.evidence")}</span><input value={evidence} onChange={(e) => setEvidence(e.target.value)} minLength={3} maxLength={300} required /></label>
                  </div>
                  <p className="gx-muted">{t("transfers.reverseHint")}</p>
                  <button type="submit" className="gx-btn" disabled={busy === row.id || note.trim().length < 5 || evidence.trim().length < 3}>{t("transfers.reverse")}</button>
                </form>
              ) : (
                <button type="button" className="gx-btn" onClick={() => setReversing(row.id)}>{t("transfers.reverse")}</button>
              )
            ) : null}
            {message?.id === row.id ? <p className="aw-error" role="alert">{message.text}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Pick a wallet owner: kind of owner, then search by name (organisations) or name/mobile/email (members). */
function OwnerPicker({ label, value, onChange, initialType }: { label: string; value: AdminWalletAccountDto | null; onChange: (v: AdminWalletAccountDto | null) => void; initialType: WalletOwnerTypeValue }) {
  const t = useTranslations("adminWallets");
  const { money } = useFormat();
  const [type, setType] = useState<WalletOwnerTypeValue>(initialType);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminWalletAccountDto[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      setResults((await adminWalletsService.accounts(type, q.trim(), 1, 8)).items);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="gx-field">
        <span>{label}</span>
        <div className="aw-picked">
          <OwnerLabel owner={value.owner} />
          <small>{t("transfers.available", { amount: money(value.balances.total) })}</small>
          <button type="button" className="gx-btn" onClick={() => onChange(null)}>{t("transfers.change")}</button>
        </div>
      </div>
    );
  }
  return (
    <fieldset className="aw-picker">
      <legend>{label}</legend>
      <div className="aw-form__row">
        <label className="gx-field">
          <span>{t("business.typeLabel")}</span>
          <select value={type} onChange={(e) => { setType(e.target.value as WalletOwnerTypeValue); setResults(null); }}>
            {OWNER_TYPES.map((k) => <option key={k} value={k}>{t(`business.kind.${k}`)}</option>)}
          </select>
        </label>
        <label className="gx-field">
          <span>{t("business.search")}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} maxLength={120} />
        </label>
        <button type="button" className="gx-btn" disabled={busy || q.trim().length < 2} onClick={() => void search()}>
          <Search size={16} aria-hidden="true" />
          {t("business.searchButton")}
        </button>
      </div>
      {results ? (
        results.length ? (
          <ul className="aw-list">
            {results.map((r) => (
              <li key={r.owner.walletAccountId}>
                <button type="button" className="aw-pick" onClick={() => onChange(r)}>
                  <strong>{r.owner.name}</strong>
                  <small>{t(`business.kind.${r.owner.type}`)} · {money(r.balances.total)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gx-muted">{t("business.empty")}</p>
        )
      ) : null}
    </fieldset>
  );
}

/** The request form: two wallets, a bucket, an amount in toman, a reason code, a note and evidence. */
function NewTransferForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("adminWallets");
  const { money } = useFormat();
  const params = useSearchParams();
  const [from, setFrom] = useState<AdminWalletAccountDto | null>(null);
  const [to, setTo] = useState<AdminWalletAccountDto | null>(null);
  const [balanceType, setBalanceType] = useState<WalletBalanceTypeValue>("PURCHASE_ONLY");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState<WalletTransferReasonCode>("OWNER_REQUEST");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());

  // Prefilled from a wallet page ("transfer from / to this wallet").
  useEffect(() => {
    for (const side of ["from", "to"] as const) {
      const type = params?.get(`${side}Type`) as WalletOwnerTypeValue | null;
      const id = params?.get(`${side}Id`);
      if (!type || !id || !OWNER_TYPES.includes(type) || !UUID.test(id)) continue;
      adminWalletsService.accounts(type, id, 1, 1).then((r) => { if (r.items[0]) (side === "from" ? setFrom : setTo)(r.items[0]); }).catch(() => undefined);
    }
  }, [params]);

  const rial = tomanToRial(amount);
  const valid = !!from && !!to && from.owner.walletAccountId !== to.owner.walletAccountId && rial !== null && rial > 0 && rial <= WALLET_TRANSFER_MAX_IRR && note.trim().length >= 5 && evidence.trim().length >= 3;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !from || !to || rial === null) return;
    setBusy(true);
    setError(null);
    try {
      await adminWalletsService.requestTransfer(
        { from: { type: from.owner.type, id: from.owner.ownerId }, to: { type: to.owner.type, id: to.owner.ownerId }, balanceType, amount: rial, reasonCode, note: note.trim(), evidenceReference: evidence.trim() },
        key.current,
      );
      key.current = newKey();
      setAmount("");
      setNote("");
      setEvidence("");
      onCreated();
    } catch (err) {
      setError(errorText(t, err));
      key.current = newKey();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="aw-form" onSubmit={submit} aria-labelledby="aw-new-transfer">
      <h2 id="aw-new-transfer">{t("transfers.new")}</h2>
      <p className="gx-muted">{t("transfers.newHint", { max: money(WALLET_TRANSFER_MAX_IRR) })}</p>
      <div className="gx-grid aw-two">
        <OwnerPicker label={t("transfers.from")} value={from} onChange={setFrom} initialType="MEMBER" />
        <OwnerPicker label={t("transfers.to")} value={to} onChange={setTo} initialType="SELLER" />
      </div>
      <div className="aw-form__row">
        <label className="gx-field">
          <span>{t("transfers.bucket")}</span>
          <select value={balanceType} onChange={(e) => setBalanceType(e.target.value as WalletBalanceTypeValue)}>
            <option value="PURCHASE_ONLY">{t("columns.purchaseOnly")}</option>
            <option value="WITHDRAWABLE">{t("columns.withdrawable")}</option>
          </select>
        </label>
        <label className="gx-field">
          <span>{t("transfers.amount")}</span>
          <input inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="gx-field">
          <span>{t("transfers.reasonCode")}</span>
          <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value as WalletTransferReasonCode)}>
            {WALLET_TRANSFER_REASON_CODES.map((c) => <option key={c} value={c}>{t(`transfers.reason.${c}`)}</option>)}
          </select>
        </label>
      </div>
      <div className="aw-form__row">
        <label className="gx-field"><span>{t("transfers.note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} minLength={5} maxLength={1000} required /></label>
        <label className="gx-field"><span>{t("transfers.evidence")}</span><input value={evidence} onChange={(e) => setEvidence(e.target.value)} minLength={3} maxLength={300} required placeholder={t("transfers.evidenceHint")} /></label>
      </div>
      <p className="gx-muted">{t("transfers.rules")}</p>
      {error ? <p className="aw-error" role="alert">{error}</p> : null}
      <div className="gx-toolbar">
        <button type="submit" className="gx-btn gx-btn--primary" disabled={!valid || busy}>{t("transfers.submit")}</button>
      </div>
    </form>
  );
}

/** /admin/wallets/transfers — the two-person transfer queue and the request form. */
export function AdminWalletTransfersView() {
  const t = useTranslations("adminWallets");
  const perms = usePerms();
  const params = useSearchParams();
  const [status, setStatus] = useState<WalletAdjustmentRequestStatusValue | "ALL">("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminWalletTransferDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [showForm, setShowForm] = useState(params?.get("new") === "1");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await adminWalletsService.transfers({ status: status === "ALL" ? undefined : status, page }));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [status, page]);
  useEffect(() => void load(), [load]);

  if ((perms.ready && !perms.has("wallet.view")) || failed === "forbidden") return <Forbidden />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="gx-page">
      <Head title={t("transfers.title")} subtitle={t("transfers.subtitle")} />
      {notice ? <p className="gx-inline-alert" role="status">{notice}</p> : null}
      {perms.has("wallet.adjust") ? (
        <section className="gx-card">
          {showForm ? (
            <NewTransferForm onCreated={() => { setShowForm(false); setStatus("PENDING"); setNotice(t("transfers.created")); void load(); }} />
          ) : (
            <button type="button" className="gx-btn gx-btn--primary" onClick={() => setShowForm(true)}>{t("transfers.new")}</button>
          )}
        </section>
      ) : null}
      <section className="gx-card">
        <div className="gx-toolbar" role="tablist" aria-label={t("transfers.filter")}>
          {STATUS_FILTERS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={status === s} className={`gx-btn ${status === s ? "gx-btn--primary" : ""}`} onClick={() => { setStatus(s); setPage(1); }}>
              {s === "ALL" ? t("transfers.all") : t(`transfers.status.${s}`)}
            </button>
          ))}
        </div>
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert">
            <p>{t("failed")}</p>
            <button type="button" className="gx-btn" onClick={() => void load()}>{t("retry")}</button>
          </div>
        ) : !data ? (
          <div className="gx-skel" style={{ height: 200 }} aria-label={t("loading")} />
        ) : data.items.length === 0 ? (
          <p className="gx-empty">{t("transfers.empty")}</p>
        ) : (
          <TransferList rows={data.items} onChanged={load} />
        )}
        {data && pages > 1 ? (
          <nav className="gx-toolbar aw-pager" aria-label={t("pageOf", { page, pages })}>
            <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("previous")}</button>
            <span className="gx-muted">{t("pageOf", { page, pages })}</span>
            <button type="button" className="gx-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("next")}</button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
