"use client";

import "./admin-orders.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, Search, X } from "@petlife/ui";
import type { AdminOrderRowDto, AdminOrderSection, AdminOrdersPageDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { adminOrdersService, type AdminOrdersParams } from "@/services/admin-orders.service";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import { PAYMENT_STATES, SECTION_STATUSES, STAGES } from "./order-sections";
import { useOrderLabels } from "./order-labels";

const FILTER_KEYS = ["q", "status", "stage", "payment", "partnerId", "partnerName", "customerId", "customerName", "city", "from", "to"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Partial<Record<FilterKey, string>>;

const PAYMENT_TONE: Record<string, string> = { PAID: "ACTIVE", PENDING: "AT_RISK", FAILED: "NEVER_PURCHASED", REFUNDED: "DORMANT", PARTIALLY_REFUNDED: "DORMANT", ON_ARRIVAL: "NEW" };
const STAGE_TONE: Record<string, string> = { OPEN: "NEW", COMPLETED: "ACTIVE", CANCELLED: "DORMANT" };

/**
 * Admin → Orders: every section's orders with partner, items, customer and money in one table — kept apart by the
 * section tabs, merged newest first under "All". Filters live in the URL, so a partner or customer link can open the
 * list already narrowed.
 */
export function AdminOrdersView({ section }: { section: AdminOrderSection | "ALL" }) {
  const t = useTranslations("adminOrders");
  const l = useOrderLabels();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filters = useMemo<Filters>(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, search.get(k) ?? ""]).filter(([, v]) => v)), [search]);
  const [draft, setDraft] = useState(filters.q ?? "");
  const [page, setPage] = useState<AdminOrdersPageDto | null>(null);
  const [rows, setRows] = useState<AdminOrderRowDto[]>([]);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<AdminOrderRowDto | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const request = useRef(0);
  const [revision, setRevision] = useState(0);

  const params = useCallback((before?: string): AdminOrdersParams => {
    const { partnerName: _p, customerName: _c, from, to, ...rest } = filters;
    return { section, ...rest, from: from ? `${from}T00:00:00+03:30` : undefined, to: to ? `${to}T23:59:59+03:30` : undefined, before, limit: 25 };
  }, [filters, section]);

  useEffect(() => {
    const id = ++request.current;
    const controller = new AbortController();
    setPage(null);
    setRows([]);
    setError(null);
    adminOrdersService
      .list(params(), controller.signal)
      .then((p) => {
        if (id !== request.current) return;
        setPage(p);
        setRows(p.items);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || id !== request.current) return;
        setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed");
      });
    return () => controller.abort();
  }, [params, revision]);
  useEffect(() => setDraft(filters.q ?? ""), [filters.q]);

  const setFilters = (next: Filters) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    router.replace(qs.toString() ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const patch = (p: Filters) => setFilters({ ...filters, ...p });
  const loadMore = async () => {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await adminOrdersService.list(params(page.nextCursor));
      setPage(next);
      setRows((r) => [...r, ...next.items]);
    } catch {
      setError("failed");
    } finally {
      setLoadingMore(false);
    }
  };
  const doExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await adminOrdersService.exportCsv(params());
    } catch (e) {
      setExportError(e instanceof ApiError && e.status === 429 ? t("export.tooMany") : t("export.failed"));
    } finally {
      setExporting(false);
    }
  };

  const total = page ? (section === "ALL" ? page.sections.reduce((s, x) => s + x.total, 0) : page.sections.find((s) => s.section === section)?.total ?? 0) : null;
  const statusOptions = section === "ALL" ? null : SECTION_STATUSES[section];
  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  return (
    <div className="gx-page gx-orders">
      <header className="gx-pagehead">
        <div className="gx-pagehead__text">
          <p className="gx-kicker">{t("kicker")}</p>
          <h1>{section === "ALL" ? t("titleAll") : t("title", { section: l.section(section) })}</h1>
          <p className="gx-muted">{t("intro")}</p>
        </div>
        {page?.canExport ? (
          <div className="gx-pagehead__actions">
            <button type="button" className="gx-btn" onClick={() => void doExport()} disabled={exporting || !rows.length}>
              <Download size={16} aria-hidden="true" /> {exporting ? t("export.working") : t("export.button")}
            </button>
          </div>
        ) : null}
      </header>
      {exportError ? <p role="alert" className="gx-inline-alert">{exportError}</p> : null}

      {section === "ALL" && page ? (
        <ul className="gx-orders-sections" aria-label={t("sectionCounts")}>
          {page.sections.map((s) => (
            <li key={s.section}>
              <span className={`gx-orders-chip gx-orders-chip--${s.section}`}>{l.section(s.section)}</span>
              <b className="gx-num">{l.number(s.total)}</b>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="gx-card gx-orders-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          patch({ q: draft.trim() || undefined });
        }}
      >
        <label className="gx-field gx-orders-search">
          {t("filters.search")}
          <span className="gx-orders-searchbox">
            <Search size={16} aria-hidden="true" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("filters.searchPlaceholder")} maxLength={60} />
          </span>
        </label>
        {statusOptions ? (
          <label className="gx-field">
            {t("filters.status")}
            <select value={filters.status ?? ""} onChange={(e) => patch({ status: e.target.value || undefined })}>
              <option value="">{t("filters.any")}</option>
              {statusOptions.map((s) => <option key={s} value={s}>{l.code(s, section as AdminOrderSection)}</option>)}
            </select>
          </label>
        ) : (
          <label className="gx-field">
            {t("filters.stage")}
            <select value={filters.stage ?? ""} onChange={(e) => patch({ stage: e.target.value || undefined })}>
              <option value="">{t("filters.any")}</option>
              {STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}
            </select>
          </label>
        )}
        <label className="gx-field">
          {t("filters.payment")}
          <select value={filters.payment ?? ""} onChange={(e) => patch({ payment: e.target.value || undefined })}>
            <option value="">{t("filters.any")}</option>
            {PAYMENT_STATES.map((s) => <option key={s} value={s}>{t(`payment.${s}`)}</option>)}
          </select>
        </label>
        <label className="gx-field">
          {t("filters.city")}
          <input defaultValue={filters.city ?? ""} key={filters.city ?? ""} maxLength={60} onBlur={(e) => e.target.value.trim() !== (filters.city ?? "") && patch({ city: e.target.value.trim() || undefined })} />
        </label>
        <label className="gx-field">
          {t("filters.from")}
          <input type="date" value={filters.from ?? ""} onChange={(e) => patch({ from: e.target.value || undefined })} />
        </label>
        <label className="gx-field">
          {t("filters.to")}
          <input type="date" value={filters.to ?? ""} onChange={(e) => patch({ to: e.target.value || undefined })} />
        </label>
        <div className="gx-orders-filteractions">
          <button type="submit" className="gx-btn gx-btn--primary">{t("filters.apply")}</button>
          {hasFilters ? <button type="button" className="gx-btn" onClick={() => setFilters({})}>{t("filters.clear")}</button> : null}
        </div>
        {filters.partnerId || filters.customerId ? (
          <div className="gx-chips gx-orders-active">
            {filters.partnerId ? (
              <button type="button" className="gx-chip" onClick={() => patch({ partnerId: undefined, partnerName: undefined })} aria-label={t("filters.removePartner", { name: filters.partnerName ?? "" })}>
                {t("filters.partner", { name: filters.partnerName ?? "…" })} <X size={14} aria-hidden="true" />
              </button>
            ) : null}
            {filters.customerId ? (
              <button type="button" className="gx-chip" onClick={() => patch({ customerId: undefined, customerName: undefined })} aria-label={t("filters.removeCustomer", { name: filters.customerName ?? "" })}>
                {t("filters.customer", { name: filters.customerName ?? "…" })} <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      {error === "forbidden" ? (
        <p className="gx-inline-alert" role="alert">{t("errors.forbidden")}</p>
      ) : error === "failed" ? (
        <div className="gx-inline-alert" role="alert">
          <p>{t("errors.failed")}</p>
          <button type="button" className="gx-btn" onClick={() => setRevision((n) => n + 1)}>{t("retry")}</button>
        </div>
      ) : !page ? (
        <div className="gx-card gx-skel" style={{ minHeight: 280 }} aria-busy="true" aria-label={t("loading")} />
      ) : (
        <section className="gx-card" aria-labelledby="orders-list-title">
          <h2 id="orders-list-title" className="gx-section-title">{t("list.title", { count: total ?? 0 })}</h2>
          {!rows.length ? (
            <p className="gx-empty">{hasFilters ? t("list.emptyFiltered") : t("list.empty")}</p>
          ) : (
            <div className="gx-table-wrap">
              <table className="gx-table gx-orders-table">
                <thead>
                  <tr>
                    <th scope="col">{t("col.order")}</th>
                    <th scope="col">{t("col.partner")}</th>
                    <th scope="col">{t("col.items")}</th>
                    <th scope="col">{t("col.customer")}</th>
                    <th scope="col">{t("col.amount")}</th>
                    <th scope="col">{t("col.payment")}</th>
                    <th scope="col">{t("col.fulfilment")}</th>
                    <th scope="col">{t("col.city")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.section}:${r.id}`}>
                      <td>
                        <button type="button" className="gx-link gx-orders-number" onClick={() => setOpen(r)} aria-label={t("openOrder", { number: r.number })}>
                          <span dir="ltr">{r.number}</span>
                        </button>
                        <small className="gx-muted">{l.dateTime(r.createdAt)}</small>
                        {section === "ALL" ? <span className={`gx-orders-chip gx-orders-chip--${r.section}`}>{l.section(r.section)}</span> : null}
                      </td>
                      <td>
                        {r.partner?.id ? (
                          <button type="button" className="gx-link" onClick={() => patch({ partnerId: r.partner!.id!, partnerName: r.partner!.name })} title={t("filters.byPartner")}>
                            {r.partner.name}
                          </button>
                        ) : r.partner?.kind === "PLATFORM" ? (
                          <span>{t("platform")}</span>
                        ) : (
                          <span className="gx-muted">{t("noPartner")}</span>
                        )}
                        {r.partner ? <small className="gx-muted">{t(`partnerKind.${r.partner.kind}`)}</small> : null}
                      </td>
                      <td>
                        <ul className="gx-orders-items">
                          {r.items.map((i, n) => (
                            <li key={n}>
                              {(l.locale === "fa" && i.nameFa) || i.name}
                              {i.variant ? <span className="gx-muted"> · {l.code(i.variant)}</span> : null}
                              {r.section === "SHOP" ? <span className="gx-muted gx-num"> ×{l.number(i.quantity)}</span> : null}
                            </li>
                          ))}
                        </ul>
                        {r.itemCount > r.items.length ? <small className="gx-muted">{t("moreItems", { count: r.itemCount - r.items.length })}</small> : null}
                      </td>
                      <td>
                        {r.customer?.anonymous ? (
                          <span className="gx-muted">{r.customer.name ? t("anonymousAs", { name: r.customer.name }) : t("anonymous")}</span>
                        ) : r.customer?.userId ? (
                          <button type="button" className="gx-link" onClick={() => patch({ customerId: r.customer!.userId!, customerName: r.customer!.name ?? "" })} title={t("filters.byCustomer")}>
                            {r.customer.name}
                          </button>
                        ) : (
                          <span className="gx-muted">—</span>
                        )}
                        {r.customer?.phoneMasked ? <small className="gx-muted" dir="ltr">{r.customer.phoneMasked}</small> : null}
                      </td>
                      <td className="gx-num">
                        <b>{l.money(r.amounts.totalIrr)}</b>
                        {r.amounts.discountIrr ? <small className="gx-muted">{t("discount", { amount: l.money(r.amounts.discountIrr) })}</small> : null}
                        {r.amounts.commissionIrr !== null ? <small className="gx-muted">{t("commission", { amount: l.money(r.amounts.commissionIrr) })}</small> : null}
                      </td>
                      <td>
                        <span className={`gx-tag gx-tag--${PAYMENT_TONE[r.payment.state] ?? ""}`}>{t(`payment.${r.payment.state}`)}</span>
                        {r.payment.method ? <small className="gx-muted">{l.code(r.payment.method)}</small> : null}
                      </td>
                      <td>
                        <span className={`gx-tag gx-tag--${STAGE_TONE[r.stage] ?? ""}`}>{l.code(r.status, r.section)}</span>
                        {r.fulfilment.status && r.fulfilment.status !== r.status ? <small className="gx-muted">{l.code(r.fulfilment.status)}</small> : null}
                        {r.fulfilment.trackingCode ? <small className="gx-muted" dir="ltr">{r.fulfilment.trackingCode}</small> : null}
                        {r.fulfilment.scheduledAt && r.section !== "SHOP" ? <small className="gx-muted">{l.dateTime(r.fulfilment.scheduledAt)}</small> : null}
                      </td>
                      <td>{r.city ?? <span className="gx-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {page.nextCursor ? (
            <div className="gx-orders-more">
              <button type="button" className="gx-btn" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? t("loading") : t("loadMore")}</button>
            </div>
          ) : null}
        </section>
      )}
      {open ? <OrderDetailDrawer row={open} canRevealPii={!!page?.canRevealPii} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
