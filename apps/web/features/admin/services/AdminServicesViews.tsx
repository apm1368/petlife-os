"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, Dialog, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import { adminServicesService, type AdminBookingDetail, type AdminBookingRow, type AdminReviewRow, type AdminServiceRow, type AdminServicesAnalytics } from "@/services/admin-services.service";
import type { RouteLocale } from "@/lib/i18n/config";
import { DetailRow, EmptyRow, FilterBar, FilterField, Kpi, Panel, PanelTitle, SelectFilter, TableWrap, Tag, Td, TextFilter, Th } from "../console-ui";

const STATUS_OPTIONS = ["REQUESTED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER", "REJECTED", "EXPIRED", "RESCHEDULED", "NO_SHOW"];
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export function AdminServiceBookingsView() {
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("adminServices");
  const tCommon = useTranslations("admin.common");
  const label = (key: string) => t.has(key) ? t(key) : t("unknownValue");
  const [status, setStatus] = useState<string | "all">("all");
  // ?noShowParty=PROVIDER opens straight on members' "the provider didn't come" reports (dashboard tile, tasks).
  const initialNoShow = useSearchParams()?.get("noShowParty");
  const [noShow, setNoShow] = useState<string | "all">(initialNoShow === "PROVIDER" || initialNoShow === "OWNER" ? initialNoShow : "all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminBookingRow[] } | null>(null);
  const [error, setError] = useState<"forbidden" | "offline" | "error" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminServicesService.listBookings({ status: status === "all" ? undefined : status, noShowParty: noShow === "all" ? undefined : noShow, q: q.trim() || undefined, page }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : isOffline() ? "offline" : "error");
    }
  }, [status, noShow, q, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <h1 className="mb-3 text-page-title">{t("bookings.title")}</h1>
      {error === "forbidden" ? <EmptyState title={t("states.bookingsAccessDenied")} /> : null}
        {error === "offline" ? <ErrorRecovery title={t("states.loadFailedTitle")} message={t("states.offline")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
      <Panel>
        <FilterBar>
          <FilterField label={t("bookings.searchLabel")}><TextFilter value={q} onChange={(v) => { setQ(v); setPage(1); }} /></FilterField>
          <FilterField label={t("bookings.statusLabel")}>
            <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: t("common.all") }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: label(`bookingStatus.${s}`) }))]} />
          </FilterField>
          <FilterField label={t("bookings.noShowLabel")}>
            <SelectFilter value={noShow} onChange={(v) => { setNoShow(v); setPage(1); }} options={[{ value: "all", label: t("common.all") }, { value: "PROVIDER", label: t("bookings.noShowProvider") }, { value: "OWNER", label: t("bookings.noShowOwner") }]} />
          </FilterField>
        </FilterBar>
        {error === "error" ? <ErrorRecovery title={t("states.loadFailedTitle")} message={t("states.bookingsLoadFailed")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
        {!data && !error ? <Skeleton aria-label={t("states.bookingsLoading")} className="h-64 w-full" /> : null}
        {data ? (
          <>
            <TableWrap>
              <table className="w-full">
                <thead><tr><Th>{t("bookings.number")}</Th><Th>{t("bookings.when")}</Th><Th>{t("bookings.pet")}</Th><Th>{t("bookings.provider")}</Th><Th>{t("bookings.service")}</Th><Th>{t("bookings.statusLabel")}</Th><Th>{t("bookings.payment")}</Th><Th>{t("bookings.amount")}</Th></tr></thead>
                <tbody>
                  {data.items.length === 0 ? <EmptyRow colSpan={8} label={t("bookings.empty")} /> : data.items.map((b) => (
                    <tr key={b.id}>
                      <Td><Link className="text-brand-natural" href={`/${locale}/admin/services/bookings/${b.id}`} dir="ltr">{b.bookingNumber ?? b.id.slice(0, 8)}</Link></Td>
                      <Td>{formatAppointmentDateTime(b.startAt, locale, "Asia/Tehran")}</Td>
                      <Td>{b.petName}</Td>
                      <Td>{b.providerName}</Td>
                      <Td>{b.serviceName}</Td>
                      <Td><Tag tone={b.status === "COMPLETED" || b.status === "CONFIRMED" ? "success" : b.status === "REQUESTED" || b.status === "AWAITING_PAYMENT" || b.noShowParty === "PROVIDER" ? "attention" : "neutral"}>{label(`bookingStatus.${b.status}`)}</Tag>{b.noShowParty ? <span className="block text-metadata text-text-secondary">{b.noShowParty === "PROVIDER" ? t("bookings.noShowProvider") : t("bookings.noShowOwner")}</span> : null}</Td>
                      <Td>{label(`paymentStatus.${b.paymentStatus}`)}</Td>
                      <Td>{b.priceAmount !== null ? formatCurrency(b.priceAmount, locale) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span>{t("bookings.resultCount", { count: data.total.toLocaleString(locale) })}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("common.previous")}</Button>
                <Button size="sm" variant="ghost" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>{t("common.next")}</Button>
              </div>
            </div>
          </>
        ) : null}
      </Panel>
    </div>
  );
}

/** Operational transaction detail for admins: full picture, no status or money editing here. */
export function AdminServiceBookingDetailView({ bookingId }: { bookingId: string }) {
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("adminServices");
  const tCommon = useTranslations("admin.common");
  const label = (key: string) => t.has(key) ? t(key) : t("unknownValue");
  const [b, setB] = useState<AdminBookingDetail | null>(null);
  const [error, setError] = useState<"forbidden" | "notFound" | "offline" | "error" | null>(null);
  const load = useCallback(async () => {
    setError(null);
    setB(null);
    try {
      setB(await adminServicesService.getBooking(bookingId));
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 403 ? "forbidden" : e.status === 404 ? "notFound" : isOffline() ? "offline" : "error") : isOffline() ? "offline" : "error");
    }
  }, [bookingId]);
  useEffect(() => void load(), [load]);

  if (error === "forbidden") return <EmptyState title={t("states.detailAccessDenied")} />;
  if (error === "notFound") return <EmptyState title={t("states.detailNotFound")} />;
  if (error === "offline") return <ErrorRecovery title={t("states.loadFailedTitle")} message={t("states.offline")} retryLabel={tCommon("retry")} onRetry={load} />;
  if (error) return <ErrorRecovery title={t("states.loadFailedTitle")} message={t("states.detailLoadFailed")} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!b) return <Skeleton aria-label={t("states.detailLoading")} className="h-96 w-full" />;
  const formatDate = (iso: string) => formatAppointmentDateTime(iso, locale, b.timezone);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-page-title" dir="ltr">{b.bookingNumber ?? b.id}</h1>
        <Tag tone="brand">{label(`bookingStatus.${b.status}`)}</Tag>
        <Tag>{label(`paymentStatus.${b.paymentStatus}`)}</Tag>
      </header>
      <p className="text-sm text-text-secondary">{t("detail.readOnlyNotice")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title={t("detail.booking")} />
          <DetailRow label={t("detail.service")}>{b.serviceName}{b.variantName ? ` — ${b.variantName}` : ""} · {label(`category.${b.category}`)}</DetailRow>
          <DetailRow label={t("detail.when")}>{formatDate(b.startAt)}</DetailRow>
          <DetailRow label={t("detail.provider")}>{b.provider.name} ({label(`providerVerification.${b.provider.verificationStatus}`)})</DetailRow>
          <DetailRow label={t("detail.location")}>{new Intl.ListFormat(locale).format([b.location.name, b.location.city].filter(Boolean) as string[])}</DetailRow>
          <DetailRow label={t("detail.pet")}>{b.pet.name} · {label(`species.${b.pet.species}`)}</DetailRow>
          <DetailRow label={t("detail.customer")}>{b.customer.displayName} · <span dir="ltr">{b.customer.email ?? b.customer.phone ?? "—"}</span></DetailRow>
          <DetailRow label={t("detail.bookingMode")}>{label(`bookingMode.${b.bookingMode}`)}</DetailRow>
          {b.rejectedReason ? <DetailRow label={t("detail.rejectionReason")}>{b.rejectedReason}</DetailRow> : null}
          {b.cancelledReason ? <DetailRow label={t("detail.cancellationReason")}>{b.cancelledReason}</DetailRow> : null}
          {b.rescheduledFrom ? <DetailRow label={t("detail.rescheduledFrom")}><Link href={`/${locale}/admin/services/bookings/${b.rescheduledFrom.id}`}>{b.rescheduledFrom.bookingNumber}</Link></DetailRow> : null}
          {b.rescheduledTo ? <DetailRow label={t("detail.rescheduledTo")}><Link href={`/${locale}/admin/services/bookings/${b.rescheduledTo.id}`}>{b.rescheduledTo.bookingNumber}</Link></DetailRow> : null}
        </Panel>
        <Panel>
          <PanelTitle title={t("detail.finance")} />
          <DetailRow label={t("detail.snapshottedPrice")}>{b.priceAmount !== null ? formatCurrency(b.priceAmount, locale) : "—"}</DetailRow>
          <DetailRow label={t("detail.paymentMode")}>{label(`paymentMode.${b.paymentMode}`)}{b.depositAmount ? ` · ${formatCurrency(b.depositAmount, locale)}` : ""}</DetailRow>
          <DetailRow label={t("detail.cancellationTerms")}>{b.cancellationPolicy ?? "—"} ({b.freeCancellationHours ?? "—"}{t("common.hoursAbbreviation")} / {b.lateCancellationRefundPercent ?? "—"}%)</DetailRow>
          <DetailRow label={t("detail.paymentIntent")}>{b.payment ? `${label(`paymentStatus.${b.payment.status}`)} · ${label(`paymentProvider.${b.payment.provider}`)} · ${formatCurrency(b.payment.amount, locale)}` : "—"}</DetailRow>
          {b.refunds.map((r) => <DetailRow key={r.id} label={t("detail.refund")}>{formatCurrency(r.amount, locale)} · {label(`refundStatus.${r.status}`)}</DetailRow>)}
          <Link className="mt-2 inline-block text-sm text-brand-natural" href={`/${locale}/admin/transactions`}>{t("detail.reviewTransactions")}</Link>
        </Panel>
        <Panel>
          <PanelTitle title={t("detail.timeline")} />
          <ol className="flex flex-col gap-2 text-sm">
            {b.timeline.map((e, i) => <li key={i}><strong>{label(`bookingStatus.${e.toStatus}`)}</strong> · {label(`timelineActor.${e.actorType}`)} · {formatDate(e.createdAt)}{e.reason ? ` · ${e.reason}` : ""}</li>)}
          </ol>
        </Panel>
        <Panel>
          <PanelTitle title={t("detail.linkedRecords")} />
          <DetailRow label={t("detail.providerAccess")}>{b.healthAccess ? `${label(`healthScope.${b.healthAccess.scopePreset}`)} · ${b.healthAccess.canViewHealth ? t("detail.consentedHealthRead") : t("detail.noHealthRead")}${b.healthAccess.revokedAt ? ` · ${t("detail.revoked")}` : ""}` : "—"}</DetailRow>
          <DetailRow label={t("detail.clinicalVisit")}>{b.clinicalVisits.length ? new Intl.ListFormat(locale).format(b.clinicalVisits.map((v) => label(`clinicalVisitStatus.${v.status}`))) : "—"}</DetailRow>
          <DetailRow label={t("detail.review")}>{b.review ? `${b.review.rating}★ · ${label(`reviewStatus.${b.review.status}`)}` : "—"}</DetailRow>
          {b.supportCases.length ? b.supportCases.map((c) => <DetailRow key={c.id} label={t("detail.supportCase")}><Link href={`/${locale}/admin/support/${c.id}`}>{c.caseNumber}</Link> · {label(`supportStatus.${c.status}`)}</DetailRow>) : <DetailRow label={t("detail.support")}>—</DetailRow>}
        </Panel>
      </div>
    </div>
  );
}

export function AdminProviderServicesView() {
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("adminServices");
  const tAccess = useTranslations("adminServiceAccess");
  const tCommon = useTranslations("admin.common");
  const label = (key: string) => t.has(key) ? t(key) : t("unknownValue");
  const [rows, setRows] = useState<AdminServiceRow[] | null>(null);
  const [error, setError] = useState<"forbidden" | "offline" | "error" | null>(null);
  const [target, setTarget] = useState<AdminServiceRow | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminServicesService.listServices());
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : isOffline() ? "offline" : "error");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function apply() {
    if (!target) return;
    setActionError(null);
    try {
      await adminServicesService.setServiceActive(target.id, !target.isActive, reason.trim());
      setTarget(null);
      setReason("");
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 403 ? t("states.manageAccessDenied") : isOffline() ? t("states.offline") : t("states.actionFailed"));
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-page-title">{t("services.title")}</h1>
      {error === "forbidden" ? <EmptyState title={tAccess("servicesDenied")} /> : null}
      {error && error !== "forbidden" ? <ErrorRecovery title={t("states.loadFailedTitle")} message={error === "offline" ? t("states.offline") : t("states.servicesLoadFailed")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!rows && !error ? <Skeleton aria-label={t("states.servicesLoading")} className="h-64 w-full" /> : null}
      {rows ? (
        <Panel>
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>{t("services.provider")}</Th><Th>{t("services.service")}</Th><Th>{t("services.category")}</Th><Th>{t("services.modePayment")}</Th><Th>{t("services.options")}</Th><Th>{t("services.bookings")}</Th><Th>{t("services.state")}</Th><Th>{" "}</Th></tr></thead>
              <tbody>
                {rows.length === 0 ? <EmptyRow colSpan={8} label={t("services.empty")} /> : rows.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.providerName}</Td><Td>{s.name}</Td><Td>{label(`category.${s.category}`)}</Td><Td>{label(`bookingMode.${s.bookingMode}`)} / {label(`paymentMode.${s.paymentMode}`)}</Td><Td>{s.variantCount.toLocaleString(locale)}</Td><Td>{s.bookingCount.toLocaleString(locale)}</Td>
                    <Td><Tag tone={s.isActive ? "success" : "neutral"}>{s.isActive ? t("services.active") : t("services.inactive")}</Tag></Td>
                    <Td><Button size="sm" variant="ghost" onClick={() => setTarget(s)}>{s.isActive ? t("services.deactivate") : t("services.reactivate")}</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}
      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} title={target?.isActive ? t("services.deactivateTitle") : t("services.reactivateTitle")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("services.toggleNotice")}</p>
          <Input label={tCommon("reasonLabel")} placeholder={tCommon("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button disabled={!reason.trim()} onClick={() => void apply()}>{t("common.confirm")}</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function AdminProviderReviewsView() {
  const t = useTranslations("adminServices");
  const tCommon = useTranslations("admin.common");
  const label = (key: string) => t.has(key) ? t(key) : t("unknownValue");
  const [status, setStatus] = useState<"all" | "PUBLISHED" | "HIDDEN">("PUBLISHED");
  const [rows, setRows] = useState<AdminReviewRow[] | null>(null);
  const [target, setTarget] = useState<AdminReviewRow | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<"forbidden" | "offline" | "error" | null>(null);
  const load = useCallback(async () => {
    setLoadError(null);
    setRows(null);
    try {
      setRows(await adminServicesService.listReviews(status === "all" ? undefined : status));
    } catch (error) {
      setLoadError(error instanceof ApiError && error.status === 403 ? "forbidden" : isOffline() ? "offline" : "error");
    }
  }, [status]);
  useEffect(() => void load(), [load]);

  async function hide() {
    if (!target) return;
    setActionError(null);
    try {
      await adminServicesService.hideReview(target.id, reason.trim());
      setTarget(null);
      setReason("");
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 403 ? t("states.manageAccessDenied") : isOffline() ? t("states.offline") : t("states.actionFailed"));
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-page-title">{t("reviews.title")}</h1>
      <Panel>
        <FilterBar>
          <FilterField label={t("reviews.statusLabel")}><SelectFilter value={status} onChange={(v) => setStatus(v as typeof status)} options={[{ value: "PUBLISHED", label: t("reviews.published") }, { value: "HIDDEN", label: t("reviews.hidden") }, { value: "all", label: t("common.all") }]} /></FilterField>
        </FilterBar>
        {loadError === "forbidden" ? <EmptyState title={t("states.reviewsAccessDenied")} /> : null}
        {loadError === "offline" ? <ErrorRecovery title={t("states.loadFailedTitle")} message={t("states.offline")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
        {loadError === "error" ? <ErrorRecovery title={t("states.loadFailedTitle")} message={t("states.reviewsLoadFailed")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
        {!rows && !loadError ? <Skeleton aria-label={t("states.reviewsLoading")} className="h-48 w-full" /> : null}
        {rows && rows.length === 0 ? <EmptyState title={t("reviews.empty")} /> : null}
        {rows && rows.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <p><strong>{r.providerName}</strong> · {r.rating}★ · <span dir="ltr">{r.bookingNumber}</span></p>
                  {r.body ? <p className="mt-1">{r.body}</p> : null}
                  {r.hiddenReason ? <p className="mt-1 text-text-secondary">{t("reviews.hiddenBecause")} {r.hiddenReason}</p> : null}
                </div>
                {r.status === "PUBLISHED" ? <Button size="sm" variant="ghost" onClick={() => setTarget(r)}>{t("reviews.hide")}</Button> : <Tag>{label(`reviewStatus.${r.status}`)}</Tag>}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} title={t("reviews.hideTitle")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("reviews.hideNotice")}</p>
          <Input label={tCommon("reasonLabel")} placeholder={tCommon("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button disabled={!reason.trim()} onClick={() => void hide()}>{t("reviews.confirmHide")}</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function AdminServicesAnalyticsView() {
  const locale = useLocale() as RouteLocale;
  const t = useTranslations("adminServices");
  const tAccess = useTranslations("adminServiceAccess");
  const tCommon = useTranslations("admin.common");
  const label = (key: string) => t.has(key) ? t(key) : t("unknownValue");
  const [data, setData] = useState<AdminServicesAnalytics | null>(null);
  const [waitlist, setWaitlist] = useState<Awaited<ReturnType<typeof adminServicesService.waitlist>> | null>(null);
  const [error, setError] = useState<"forbidden" | "offline" | "error" | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, w] = await Promise.all([adminServicesService.analytics(30), adminServicesService.waitlist()]);
      setData(a);
      setWaitlist(w);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : isOffline() ? "offline" : "error");
    }
  }, []);
  useEffect(() => void load(), [load]);
  const n = (v: number) => v.toLocaleString(locale);

  return (
    <div>
      <h1 className="mb-3 text-page-title">{t("analytics.title", { days: n(30) })}</h1>
      {error === "forbidden" ? <EmptyState title={tAccess("analyticsDenied")} /> : null}
      {error && error !== "forbidden" ? <ErrorRecovery title={t("states.loadFailedTitle")} message={error === "offline" ? t("states.offline") : t("states.analyticsLoadFailed")} retryLabel={tCommon("retry")} onRetry={load} /> : null}
      {!data && !error ? <Skeleton aria-label={t("states.analyticsLoading")} className="h-48 w-full" /> : null}
      {data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t("analytics.bookings")} value={n(data.totalBookings)} />
            <Kpi label={t("analytics.completed")} value={n(data.completed)} tone="success" />
            <Kpi label={t("analytics.cancelled")} value={n(data.cancelled)} tone="attention" />
            <Kpi label={t("analytics.noShow")} value={n(data.noShow)} tone="concern" />
            <Kpi label={t("analytics.openRequests")} value={n(data.requested)} />
            <Kpi label={t("analytics.rejectedExpired")} value={`${n(data.rejected)} / ${n(data.expired)}`} />
            <Kpi label={t("analytics.averageRating")} value={data.reviewAverage === null ? "—" : `${n(data.reviewAverage)} (${n(data.reviewCount)})`} />
            <Kpi label={t("analytics.activeWaitlist")} value={n(data.waitlistActive)} />
          </div>
          <Panel>
            <PanelTitle title={t("analytics.byCategory")} />
            <ul className="text-sm">{Object.entries(data.byCategory).map(([k, v]) => <li key={k} className="flex justify-between py-1"><span>{label(`category.${k}`)}</span><span>{n(v)}</span></li>)}</ul>
          </Panel>
          <Panel>
            <PanelTitle title={t("analytics.waitlist")} hint={t("analytics.waitlistOrder")} />
            {waitlist?.length ? (
              <ul className="divide-y divide-border-subtle text-sm">{waitlist.map((w) => <li key={w.id} className="flex justify-between py-2"><span>{w.providerName} · {w.serviceName}</span><span>{label(`waitlistStatus.${w.status}`)}</span></li>)}</ul>
            ) : <p className="text-sm text-text-secondary">{t("analytics.waitlistEmpty")}</p>}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
