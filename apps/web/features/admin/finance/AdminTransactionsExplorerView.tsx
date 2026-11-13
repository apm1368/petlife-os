"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ADMIN_TRANSACTION_GATEWAYS, ADMIN_TRANSACTION_KINDS } from "@petlife/types";
import type { AdminTransactionFilters, AdminTransactionGateway, AdminTransactionKind, AdminTransactionRowDto } from "@petlife/types";
import { ArrowLeftRight, Search } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminTransactionsService } from "@/services/admin-transactions.service";
import { useAdminStore } from "@/stores/admin-store";
import "./admin-transactions-explorer.css";

/** Toman typed by staff (Persian or Latin digits) → integer rials, or null; empty → undefined. */
export function tomanToRial(raw: string): number | null | undefined {
  const latin = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,\s٬،]/g, "");
  if (!latin) return undefined;
  if (!/^\d{1,11}$/.test(latin)) return null;
  return Number(latin) * 10;
}

/** A YYYY-MM-DD from a date input → the start (or end) of that day in Tehran, as an ISO instant the API accepts. */
export function tehranDayBound(day: string, end: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  return `${day}T${end ? "23:59:59.999" : "00:00:00.000"}+03:30`;
}

interface Draft {
  kind: AdminTransactionKind | "";
  person: string;
  product: string;
  from: string;
  to: string;
  min: string;
  max: string;
  gateway: AdminTransactionGateway | "";
  status: string;
}

const EMPTY: Draft = { kind: "", person: "", product: "", from: "", to: "", min: "", max: "", gateway: "", status: "" };

/** /admin/transactions/explorer — every payment, refund, top-up and wallet correction, filtered and paged. */
export function AdminTransactionsExplorerView() {
  const t = useTranslations("adminTransactionsExplorer");
  const locale = useLocale() as RouteLocale;
  const context = useAdminStore((s) => s.context);
  const can = (p: string) => !!context?.permissions?.includes(p as never);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filters, setFilters] = useState<AdminTransactionFilters>({});
  const [rows, setRows] = useState<AdminTransactionRowDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState<"forbidden" | "error" | "invalid" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const money = useCallback((rial: number) => formatCurrency(rial, locale), [locale]);
  const date = useCallback(
    (iso: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(iso)),
    [locale],
  );
  const label = (group: string, key: string | null) => (key && t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key ?? "—");

  const load = useCallback(async (next: AdminTransactionFilters) => {
    setFailed(null);
    setRows(null);
    setCursor(null);
    try {
      const page = await adminTransactionsService.list(next);
      setRows(page.items);
      setCursor(page.nextCursor);
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : error instanceof ApiError && error.status === 400 ? "invalid" : "error");
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await adminTransactionsService.list(filters, cursor);
      setRows((current) => [...(current ?? []), ...page.items.filter((r) => !(current ?? []).some((c) => c.id === r.id && c.kind === r.kind))]);
      setCursor(page.nextCursor);
    } catch {
      setFailed("error");
    } finally {
      setLoadingMore(false);
    }
  }

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const minAmount = tomanToRial(draft.min);
    const maxAmount = tomanToRial(draft.max);
    if (minAmount === null || maxAmount === null || (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount)) {
      setFailed("invalid");
      return;
    }
    setExportNote(null);
    setFilters({
      kind: draft.kind || undefined,
      person: draft.person.trim() || undefined,
      product: draft.product.trim() || undefined,
      from: tehranDayBound(draft.from, false),
      to: tehranDayBound(draft.to, true),
      minAmount,
      maxAmount,
      gateway: draft.gateway || undefined,
      status: draft.status.trim().toUpperCase() || undefined,
    });
  }

  async function exportCsv() {
    setExporting(true);
    setExportNote(null);
    try {
      const file = await adminTransactionsService.exportCsv(filters);
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportNote(file.truncated ? t("export.truncated", { rows: file.rows }) : t("export.done", { rows: file.rows }));
    } catch (error) {
      setExportNote(error instanceof ApiError && error.status === 403 ? t("export.forbidden") : t("export.failed"));
    } finally {
      setExporting(false);
    }
  }

  if ((context && !can("finance.view")) || failed === "forbidden") {
    return (
      <section className="gx-card" role="alert">
        <h1>{t("title")}</h1>
        <p className="gx-muted">{t("forbidden")}</p>
      </section>
    );
  }

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker">
            <ArrowLeftRight size={16} aria-hidden="true" />
            {t("kicker")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>

      <section className="gx-card">
        <form className="tx-filters" role="search" aria-label={t("filters.title")} onSubmit={apply}>
          <label className="gx-field">
            <span>{t("filters.person")}</span>
            <input type="search" value={draft.person} onChange={set("person")} placeholder={t("filters.personHint")} maxLength={120} />
          </label>
          <label className="gx-field">
            <span>{t("filters.product")}</span>
            <input type="search" value={draft.product} onChange={set("product")} placeholder={t("filters.productHint")} maxLength={120} />
          </label>
          <label className="gx-field">
            <span>{t("filters.kind")}</span>
            <select value={draft.kind} onChange={set("kind")}>
              <option value="">{t("filters.any")}</option>
              {ADMIN_TRANSACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {label("kind", k)}
                </option>
              ))}
            </select>
          </label>
          <label className="gx-field">
            <span>{t("filters.gateway")}</span>
            <select value={draft.gateway} onChange={set("gateway")}>
              <option value="">{t("filters.any")}</option>
              {ADMIN_TRANSACTION_GATEWAYS.map((g) => (
                <option key={g} value={g}>
                  {label("gateway", g)}
                </option>
              ))}
            </select>
          </label>
          <label className="gx-field">
            <span>{t("filters.from")}</span>
            <input type="date" value={draft.from} onChange={set("from")} />
          </label>
          <label className="gx-field">
            <span>{t("filters.to")}</span>
            <input type="date" value={draft.to} onChange={set("to")} />
          </label>
          <label className="gx-field">
            <span>{t("filters.min")}</span>
            <input inputMode="numeric" value={draft.min} onChange={set("min")} dir="ltr" />
          </label>
          <label className="gx-field">
            <span>{t("filters.max")}</span>
            <input inputMode="numeric" value={draft.max} onChange={set("max")} dir="ltr" />
          </label>
          <label className="gx-field">
            <span>{t("filters.status")}</span>
            <input value={draft.status} onChange={set("status")} placeholder="CAPTURED" dir="ltr" maxLength={40} />
          </label>
          <div className="tx-filters__actions">
            <button type="submit" className="gx-btn gx-btn--primary">
              <Search size={16} aria-hidden="true" />
              {t("filters.apply")}
            </button>
            <button
              type="button"
              className="gx-btn"
              onClick={() => {
                setDraft(EMPTY);
                setFilters({});
              }}
            >
              {t("filters.clear")}
            </button>
            {can("finance.manage") ? (
              <button type="button" className="gx-btn" disabled={exporting} onClick={() => void exportCsv()}>
                {exporting ? t("export.working") : t("export.button")}
              </button>
            ) : null}
          </div>
        </form>
        <p className="gx-muted tx-note">{t("privacyNote")}</p>
        {exportNote ? (
          <p className="gx-muted" role="status">
            {exportNote}
          </p>
        ) : null}
      </section>

      <section className="gx-card" aria-live="polite">
        {failed === "invalid" ? (
          <p className="gx-inline-alert" role="alert">
            {t("invalid")}
          </p>
        ) : null}
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert">
            <p>{t("failed")}</p>
            <button type="button" className="gx-btn" onClick={() => void load(filters)}>
              {t("retry")}
            </button>
          </div>
        ) : !rows ? (
          failed ? null : <div className="gx-skel" style={{ height: 240 }} aria-label={t("loading")} />
        ) : rows.length === 0 ? (
          <p className="gx-empty">{t("empty")}</p>
        ) : (
          <>
            <div className="gx-table-wrap">
              <table className="gx-table tx-table">
                <thead>
                  <tr>
                    <th>{t("columns.when")}</th>
                    <th>{t("columns.kind")}</th>
                    <th>{t("columns.person")}</th>
                    <th className="gx-num">{t("columns.amount")}</th>
                    <th>{t("columns.gateway")}</th>
                    <th>{t("columns.status")}</th>
                    <th>{t("columns.details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.kind}:${row.id}`}>
                      <td className="tx-when">{date(row.occurredAt)}</td>
                      <td>
                        <span className="tx-kind">{label("kind", row.kind)}</span>
                        <small className="tx-sub">{label("purpose", row.purpose)}</small>
                      </td>
                      <td>
                        {row.person ? (
                          <>
                            <Link href={`/${locale}/admin/wallets/${row.person.id}`}>{row.person.displayName}</Link>
                            <small className="tx-sub" dir="ltr">
                              {row.person.phoneMasked ?? row.person.emailMasked ?? ""}
                            </small>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`gx-num tx-amount tx-amount--${row.direction}`}>
                        <span className="tx-dir">{t(`direction.${row.direction}`)}</span> {money(row.amountIrr)}
                      </td>
                      <td>{label("gateway", row.gateway)}</td>
                      <td>
                        <span className="tx-status" dir="ltr">
                          {row.status}
                        </span>
                      </td>
                      <td className="tx-details">
                        {row.cardMasked ? (
                          <span dir="ltr" className="tx-sub">
                            {t("card")} {row.cardMasked}
                          </span>
                        ) : null}
                        {row.productTitles.length ? <span className="tx-sub">{row.productTitles.join("، ")}</span> : null}
                        <code className="tx-id" dir="ltr" title={row.id}>
                          {row.id.slice(0, 8)}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cursor ? (
              <div className="gx-toolbar tx-more">
                <button type="button" className="gx-btn" disabled={loadingMore} onClick={() => void more()}>
                  {loadingMore ? t("loading") : t("more")}
                </button>
              </div>
            ) : (
              <p className="gx-muted tx-end">{t("end", { count: rows.length })}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
