"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Button, Dialog, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import { adminServicesService, type AdminBookingDetail, type AdminBookingRow, type AdminReviewRow, type AdminServiceRow, type AdminServicesAnalytics } from "@/services/admin-services.service";
import { bookingStatusLabel, categoryLabel, paymentModeLabel, TIMELINE_ACTOR } from "@/features/discovery/labels";
import { DetailRow, EmptyRow, FilterBar, FilterField, Kpi, Panel, PanelTitle, SelectFilter, TableWrap, Tag, Td, TextFilter, Th } from "../console-ui";

const STATUS_OPTIONS = ["REQUESTED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER", "REJECTED", "EXPIRED", "RESCHEDULED", "NO_SHOW"];

/** Sub-navigation for the admin Services area. */
export function AdminServicesNav() {
  const locale = useLocale();
  const fa = locale === "fa";
  const pathname = usePathname();
  const base = `/${locale}/admin/services`;
  const items = [
    { href: base, fa: "نوبت‌ها", en: "Bookings" },
    { href: `${base}/catalog`, fa: "خدمات", en: "Services" },
    { href: `${base}/reviews`, fa: "نظرات", en: "Reviews" },
    { href: `${base}/analytics`, fa: "گزارش و لیست انتظار", en: "Analytics & waitlist" },
  ];
  return (
    <nav aria-label={fa ? "بخش خدمات" : "Services section"} className="mb-4 flex gap-1 overflow-x-auto border-b border-border-subtle">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={pathname === i.href ? "page" : undefined} className={`whitespace-nowrap px-3 py-2 text-sm ${pathname === i.href ? "border-b-2 border-brand-natural font-bold" : "text-text-secondary"}`}>
          {fa ? i.fa : i.en}
        </Link>
      ))}
    </nav>
  );
}

export function AdminServiceBookingsView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [status, setStatus] = useState<string | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminBookingRow[] } | null>(null);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminServicesService.listBookings({ status: status === "all" ? undefined : status, q: q.trim() || undefined, page }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [status, q, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <h1 className="mb-3 text-page-title">{fa ? "خدمات و نوبت‌ها" : "Services & bookings"}</h1>
      <AdminServicesNav />
      {error === "forbidden" ? <EmptyState title={fa ? "دسترسی services.view لازم است" : "services.view permission required"} /> : null}
      <Panel>
        <FilterBar>
          <FilterField label={fa ? "جست‌وجو (شماره، حیوان، ارائه‌دهنده)" : "Search (number, pet, provider)"}><TextFilter value={q} onChange={(v) => { setQ(v); setPage(1); }} /></FilterField>
          <FilterField label={fa ? "وضعیت" : "Status"}>
            <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: fa ? "همه" : "All" }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: bookingStatusLabel(s, fa) }))]} />
          </FilterField>
        </FilterBar>
        {error === "error" ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} /> : null}
        {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
        {data ? (
          <>
            <TableWrap>
              <table className="w-full">
                <thead><tr><Th>{fa ? "شماره" : "Number"}</Th><Th>{fa ? "زمان" : "When"}</Th><Th>{fa ? "حیوان" : "Pet"}</Th><Th>{fa ? "ارائه‌دهنده" : "Provider"}</Th><Th>{fa ? "خدمت" : "Service"}</Th><Th>{fa ? "وضعیت" : "Status"}</Th><Th>{fa ? "پرداخت" : "Payment"}</Th><Th>{fa ? "مبلغ" : "Amount"}</Th></tr></thead>
                <tbody>
                  {data.items.length === 0 ? <EmptyRow colSpan={8} label={fa ? "نوبتی یافت نشد" : "No bookings found"} /> : data.items.map((b) => (
                    <tr key={b.id}>
                      <Td><Link className="text-brand-natural" href={`/${locale}/admin/services/bookings/${b.id}`} dir="ltr">{b.bookingNumber ?? b.id.slice(0, 8)}</Link></Td>
                      <Td>{formatAppointmentDateTime(b.startAt, locale, "Asia/Tehran")}</Td>
                      <Td>{b.petName}</Td>
                      <Td>{b.providerName}</Td>
                      <Td>{b.serviceName}</Td>
                      <Td><Tag tone={b.status === "COMPLETED" || b.status === "CONFIRMED" ? "success" : b.status === "REQUESTED" || b.status === "AWAITING_PAYMENT" ? "attention" : "neutral"}>{bookingStatusLabel(b.status, fa)}</Tag></Td>
                      <Td>{b.paymentStatus}</Td>
                      <Td>{b.priceAmount !== null ? formatCurrency(b.priceAmount, locale) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span>{data.total.toLocaleString(locale)} {fa ? "نوبت" : "bookings"}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>{fa ? "قبلی" : "Previous"}</Button>
                <Button size="sm" variant="ghost" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>{fa ? "بعدی" : "Next"}</Button>
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
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [b, setB] = useState<AdminBookingDetail | null>(null);
  const [error, setError] = useState<"forbidden" | "notFound" | "error" | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setB(await adminServicesService.getBooking(bookingId));
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 403 ? "forbidden" : e.status === 404 ? "notFound" : "error") : "error");
    }
  }, [bookingId]);
  useEffect(() => void load(), [load]);

  if (error === "forbidden") return <EmptyState title={fa ? "دسترسی لازم را ندارید" : "You do not have access"} />;
  if (error === "notFound") return <EmptyState title={fa ? "نوبت پیدا نشد" : "Booking not found"} />;
  if (error) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!b) return <Skeleton className="h-96 w-full" />;
  const t = (iso: string) => formatAppointmentDateTime(iso, locale, b.timezone);

  return (
    <div className="flex flex-col gap-4">
      <AdminServicesNav />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-page-title" dir="ltr">{b.bookingNumber ?? b.id}</h1>
        <Tag tone="brand">{bookingStatusLabel(b.status, fa)}</Tag>
        <Tag>{b.paymentStatus}</Tag>
      </header>
      <p className="text-sm text-text-secondary">{fa ? "این صفحه فقط‌خواندنی است. بازگشت وجه از مسیر تأیید مالی و اختلاف از بخش اختلافات انجام می‌شود." : "Read-only. Refunds go through finance approval and disputes through the disputes module."}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title={fa ? "نوبت" : "Booking"} />
          <DetailRow label={fa ? "خدمت" : "Service"}>{b.serviceName}{b.variantName ? ` — ${b.variantName}` : ""} · {categoryLabel(b.category, fa)}</DetailRow>
          <DetailRow label={fa ? "زمان" : "When"}>{t(b.startAt)}</DetailRow>
          <DetailRow label={fa ? "ارائه‌دهنده" : "Provider"}>{b.provider.name} ({b.provider.verificationStatus})</DetailRow>
          <DetailRow label={fa ? "شعبه" : "Location"}>{[b.location.name, b.location.city].filter(Boolean).join("، ")}</DetailRow>
          <DetailRow label={fa ? "حیوان" : "Pet"}>{b.pet.name} · {b.pet.species}</DetailRow>
          <DetailRow label={fa ? "مشتری" : "Customer"}>{b.customer.displayName} · <span dir="ltr">{b.customer.email ?? b.customer.phone ?? "—"}</span></DetailRow>
          <DetailRow label={fa ? "نوع رزرو" : "Booking mode"}>{b.bookingMode}</DetailRow>
          {b.rejectedReason ? <DetailRow label={fa ? "علت رد" : "Rejection reason"}>{b.rejectedReason}</DetailRow> : null}
          {b.cancelledReason ? <DetailRow label={fa ? "علت لغو" : "Cancellation reason"}>{b.cancelledReason}</DetailRow> : null}
          {b.rescheduledFrom ? <DetailRow label={fa ? "منتقل‌شده از" : "Moved from"}><Link href={`/${locale}/admin/services/bookings/${b.rescheduledFrom.id}`}>{b.rescheduledFrom.bookingNumber}</Link></DetailRow> : null}
          {b.rescheduledTo ? <DetailRow label={fa ? "منتقل‌شده به" : "Moved to"}><Link href={`/${locale}/admin/services/bookings/${b.rescheduledTo.id}`}>{b.rescheduledTo.bookingNumber}</Link></DetailRow> : null}
        </Panel>
        <Panel>
          <PanelTitle title={fa ? "مالی" : "Money"} />
          <DetailRow label={fa ? "قیمت ثبت‌شده" : "Snapshotted price"}>{b.priceAmount !== null ? formatCurrency(b.priceAmount, locale) : "—"}</DetailRow>
          <DetailRow label={fa ? "پرداخت" : "Payment mode"}>{paymentModeLabel(b.paymentMode, fa)}{b.depositAmount ? ` · ${formatCurrency(b.depositAmount, locale)}` : ""}</DetailRow>
          <DetailRow label={fa ? "قوانین لغو" : "Cancellation terms"}>{b.cancellationPolicy ?? "—"} ({b.freeCancellationHours ?? "—"}h / {b.lateCancellationRefundPercent ?? "—"}%)</DetailRow>
          <DetailRow label="PaymentIntent">{b.payment ? `${b.payment.status} · ${b.payment.provider} · ${formatCurrency(b.payment.amount, locale)}` : "—"}</DetailRow>
          {b.refunds.map((r) => <DetailRow key={r.id} label={fa ? "بازگشت وجه" : "Refund"}>{formatCurrency(r.amount, locale)} · {r.status}</DetailRow>)}
          <Link className="mt-2 inline-block text-sm text-brand-natural" href={`/${locale}/admin/transactions`}>{fa ? "بررسی در بخش تراکنش‌ها" : "Review in transactions"}</Link>
        </Panel>
        <Panel>
          <PanelTitle title={fa ? "روند" : "Timeline"} />
          <ol className="flex flex-col gap-2 text-sm">
            {b.timeline.map((e, i) => <li key={i}><strong>{bookingStatusLabel(e.toStatus, fa)}</strong> · {TIMELINE_ACTOR[e.actorType]?.[fa ? 0 : 1] ?? e.actorType} · {t(e.createdAt)}{e.reason ? ` · ${e.reason}` : ""}</li>)}
          </ol>
        </Panel>
        <Panel>
          <PanelTitle title={fa ? "دسترسی، پشتیبانی و سوابق مرتبط" : "Access, support and linked records"} />
          <DetailRow label={fa ? "دسترسی ارائه‌دهنده" : "Provider access"}>{b.healthAccess ? `${b.healthAccess.scopePreset} · ${b.healthAccess.canViewHealth ? (fa ? "خواندن سلامت با رضایت" : "health read (consented)") : fa ? "بدون خواندن سلامت" : "no health read"}${b.healthAccess.revokedAt ? (fa ? " · لغوشده" : " · revoked") : ""}` : "—"}</DetailRow>
          <DetailRow label={fa ? "ویزیت بالینی" : "Clinical visit"}>{b.clinicalVisits.length ? b.clinicalVisits.map((v) => v.status).join("، ") : "—"}</DetailRow>
          <DetailRow label={fa ? "نظر" : "Review"}>{b.review ? `${b.review.rating}★ · ${b.review.status}` : "—"}</DetailRow>
          {b.supportCases.length ? b.supportCases.map((c) => <DetailRow key={c.id} label={fa ? "پرونده پشتیبانی" : "Support case"}><Link href={`/${locale}/admin/support/${c.id}`}>{c.caseNumber}</Link> · {c.status}</DetailRow>) : <DetailRow label={fa ? "پشتیبانی" : "Support"}>—</DetailRow>}
        </Panel>
      </div>
    </div>
  );
}

export function AdminProviderServicesView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [rows, setRows] = useState<AdminServiceRow[] | null>(null);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<AdminServiceRow | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(false);
    try {
      setRows(await adminServicesService.listServices());
    } catch {
      setError(true);
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
      setActionError(e instanceof ApiError && e.status === 403 ? (fa ? "دسترسی services.manage لازم است." : "services.manage permission required.") : fa ? "انجام نشد." : "Failed.");
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-page-title">{fa ? "خدمات ارائه‌دهندگان" : "Provider services"}</h1>
      <AdminServicesNav />
      {error ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} /> : null}
      {!rows && !error ? <Skeleton className="h-64 w-full" /> : null}
      {rows ? (
        <Panel>
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>{fa ? "ارائه‌دهنده" : "Provider"}</Th><Th>{fa ? "خدمت" : "Service"}</Th><Th>{fa ? "دسته" : "Category"}</Th><Th>{fa ? "رزرو / پرداخت" : "Mode / payment"}</Th><Th>{fa ? "گزینه‌ها" : "Options"}</Th><Th>{fa ? "نوبت‌ها" : "Bookings"}</Th><Th>{fa ? "وضعیت" : "State"}</Th><Th>{" "}</Th></tr></thead>
              <tbody>
                {rows.length === 0 ? <EmptyRow colSpan={8} label={fa ? "خدمتی ثبت نشده" : "No services"} /> : rows.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.providerName}</Td><Td>{s.name}</Td><Td>{categoryLabel(s.category, fa)}</Td><Td>{s.bookingMode} / {paymentModeLabel(s.paymentMode, fa)}</Td><Td>{s.variantCount.toLocaleString(locale)}</Td><Td>{s.bookingCount.toLocaleString(locale)}</Td>
                    <Td><Tag tone={s.isActive ? "success" : "neutral"}>{s.isActive ? (fa ? "فعال" : "Active") : fa ? "غیرفعال" : "Inactive"}</Tag></Td>
                    <Td><Button size="sm" variant="ghost" onClick={() => setTarget(s)}>{s.isActive ? (fa ? "غیرفعال‌سازی" : "Deactivate") : fa ? "فعال‌سازی" : "Reactivate"}</Button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}
      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} title={target?.isActive ? (fa ? "غیرفعال‌سازی خدمت" : "Deactivate service") : fa ? "فعال‌سازی خدمت" : "Reactivate service"}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">{fa ? "نوبت‌های موجود لغو نمی‌شوند؛ فقط رزرو جدید متوقف یا باز می‌شود. این اقدام در گزارش ممیزی ثبت می‌شود." : "Existing bookings are not cancelled; only new booking stops or resumes. This is audited."}</p>
          <Input label={fa ? "علت (الزامی)" : "Reason (required)"} value={reason} onChange={(e) => setReason(e.target.value)} />
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button disabled={!reason.trim()} onClick={() => void apply()}>{fa ? "تأیید" : "Confirm"}</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function AdminProviderReviewsView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [status, setStatus] = useState<"all" | "PUBLISHED" | "HIDDEN">("PUBLISHED");
  const [rows, setRows] = useState<AdminReviewRow[] | null>(null);
  const [target, setTarget] = useState<AdminReviewRow | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setRows(null);
    setRows(await adminServicesService.listReviews(status === "all" ? undefined : status).catch(() => []));
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
      setActionError(e instanceof ApiError && e.status === 403 ? (fa ? "دسترسی services.manage لازم است." : "services.manage permission required.") : fa ? "انجام نشد." : "Failed.");
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-page-title">{fa ? "نظرات ارائه‌دهندگان" : "Provider reviews"}</h1>
      <AdminServicesNav />
      <Panel>
        <FilterBar>
          <FilterField label={fa ? "وضعیت" : "Status"}><SelectFilter value={status} onChange={(v) => setStatus(v as typeof status)} options={[{ value: "PUBLISHED", label: fa ? "منتشرشده" : "Published" }, { value: "HIDDEN", label: fa ? "پنهان" : "Hidden" }, { value: "all", label: fa ? "همه" : "All" }]} /></FilterField>
        </FilterBar>
        {!rows ? <Skeleton className="h-48 w-full" /> : rows.length === 0 ? <EmptyState title={fa ? "نظری نیست" : "No reviews"} /> : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <p><strong>{r.providerName}</strong> · {r.rating}★ · <span dir="ltr">{r.bookingNumber}</span></p>
                  {r.body ? <p className="mt-1">{r.body}</p> : null}
                  {r.hiddenReason ? <p className="mt-1 text-text-secondary">{fa ? "علت پنهان‌سازی: " : "Hidden because: "}{r.hiddenReason}</p> : null}
                </div>
                {r.status === "PUBLISHED" ? <Button size="sm" variant="ghost" onClick={() => setTarget(r)}>{fa ? "پنهان‌سازی" : "Hide"}</Button> : <Tag>{fa ? "پنهان" : "Hidden"}</Tag>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} title={fa ? "پنهان‌سازی نظر" : "Hide review"}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">{fa ? "نظر حذف نمی‌شود؛ از نمایش عمومی و میانگین امتیاز خارج می‌شود و در ممیزی ثبت می‌شود." : "The review is not deleted; it leaves public display and the rating average, and the action is audited."}</p>
          <Input label={fa ? "علت (الزامی)" : "Reason (required)"} value={reason} onChange={(e) => setReason(e.target.value)} />
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button disabled={!reason.trim()} onClick={() => void hide()}>{fa ? "پنهان شود" : "Hide"}</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function AdminServicesAnalyticsView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [data, setData] = useState<AdminServicesAnalytics | null>(null);
  const [waitlist, setWaitlist] = useState<Awaited<ReturnType<typeof adminServicesService.waitlist>> | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      const [a, w] = await Promise.all([adminServicesService.analytics(30), adminServicesService.waitlist()]);
      setData(a);
      setWaitlist(w);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);
  const n = (v: number) => v.toLocaleString(locale);

  return (
    <div>
      <h1 className="mb-3 text-page-title">{fa ? "گزارش خدمات (۳۰ روز)" : "Services analytics (30 days)"}</h1>
      <AdminServicesNav />
      {error ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} /> : null}
      {!data && !error ? <Skeleton className="h-48 w-full" /> : null}
      {data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={fa ? "نوبت‌ها" : "Bookings"} value={n(data.totalBookings)} />
            <Kpi label={fa ? "انجام‌شده" : "Completed"} value={n(data.completed)} tone="success" />
            <Kpi label={fa ? "لغو" : "Cancelled"} value={n(data.cancelled)} tone="attention" />
            <Kpi label={fa ? "عدم حضور" : "No-show"} value={n(data.noShow)} tone="concern" />
            <Kpi label={fa ? "درخواست باز" : "Open requests"} value={n(data.requested)} />
            <Kpi label={fa ? "رد / منقضی" : "Rejected / expired"} value={`${n(data.rejected)} / ${n(data.expired)}`} />
            <Kpi label={fa ? "میانگین امتیاز" : "Avg rating"} value={data.reviewAverage === null ? "—" : `${n(data.reviewAverage)} (${n(data.reviewCount)})`} />
            <Kpi label={fa ? "لیست انتظار فعال" : "Active waitlist"} value={n(data.waitlistActive)} />
          </div>
          <Panel>
            <PanelTitle title={fa ? "بر اساس دسته" : "By category"} />
            <ul className="text-sm">{Object.entries(data.byCategory).map(([k, v]) => <li key={k} className="flex justify-between py-1"><span>{categoryLabel(k, fa)}</span><span>{n(v)}</span></li>)}</ul>
          </Panel>
          <Panel>
            <PanelTitle title={fa ? "لیست انتظار" : "Waitlist"} hint={fa ? "به ترتیب ثبت" : "In joining order"} />
            {waitlist?.length ? (
              <ul className="divide-y divide-border-subtle text-sm">{waitlist.map((w) => <li key={w.id} className="flex justify-between py-2"><span>{w.providerName} · {w.serviceName}</span><span>{w.status}</span></li>)}</ul>
            ) : <p className="text-sm text-text-secondary">{fa ? "لیست انتظار خالی است." : "The waitlist is empty."}</p>}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
