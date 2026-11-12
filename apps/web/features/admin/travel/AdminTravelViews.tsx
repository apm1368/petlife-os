"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { AdminTravelAnalyticsDto, TravelRequirementRuleDto, TravelRequirementType } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { adminInsuranceOpsService, adminTravelService, type AdminInsuranceApplicationRow, type AdminTravelBookingDetail, type AdminTravelBookingRow, type AdminTravelListingRow, type AdminTravelReviewRow, type RequirementRuleInput } from "@/services/travel-marketplace.service";
import { bookingStatusLabel, cancellationSummary, listingTypeLabel, money, paymentStatusLabel, policyFacts, stayDates } from "@/features/travel-market/labels";
import { DetailRow, EmptyRow, FilterBar, FilterField, Kpi, Panel, PanelTitle, SelectFilter, TableWrap, Tag, Td, TextFilter, Th } from "../console-ui";
import { copyFor } from "@/features/admin/admin-copy";
import { externalHref } from "@/lib/url/external-href";

type Lang = "fa" | "en" | "de" | "es";
const useLang = () => {
  const lang = useLocale() as Lang;
  return { lang, fa: lang === "fa", ...copyFor(lang) };
};
type LoadError = "forbidden" | "notFound" | "error" | null;
/** The shared travel label tables are Persian/English pairs; German and Spanish admins read the English side. */
const pairLang = (lang: Lang): "fa" | "en" => (lang === "fa" ? "fa" : "en");
const toError = (e: unknown): LoadError => (e instanceof ApiError ? (e.status === 403 ? "forbidden" : e.status === 404 ? "notFound" : "error") : "error");

const LISTING_STATUSES = ["PENDING_REVIEW", "PUBLISHED", "DRAFT", "SUSPENDED", "ARCHIVED"];
const LISTING_STATUS_LABEL: Record<string, [string, string]> = { DRAFT: ["پیش‌نویس", "Draft"], PENDING_REVIEW: ["در انتظار بررسی", "Pending review"], PUBLISHED: ["منتشر شده", "Published"], SUSPENDED: ["معلق", "Suspended"], ARCHIVED: ["بایگانی", "Archived"] };
const REQUIREMENT_TYPES = ["VACCINATION", "RABIES", "MICROCHIP", "HEALTH_CERTIFICATE", "IMPORT_PERMIT", "EXPORT_PERMIT", "CARRIER", "AIRLINE_POLICY", "MEDICATION", "QUARANTINE", "PARASITE_TREATMENT", "PASSPORT_DOCUMENT", "OTHER"];

function Forbidden({ perm }: { perm: string }) {
  const { trf } = useLang();
  return <EmptyState title={trf("دسترسی {perm} لازم است", "{perm} permission required", { perm })} />;
}

/** ADMIN TRAVEL PATTERN — moderation queue first (pending, oldest submission first). */
export function AdminTravelListingsView() {
  const { lang, tr } = useLang();
  const [status, setStatus] = useState<string | "all">("PENDING_REVIEW");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminTravelListingRow[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminTravelService.listings({ status: status === "all" ? undefined : status, q: q.trim() || undefined, page }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, q, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <div>
      <h1 className="mb-3 text-page-title">{tr("سفر و اقامت", "Travel & stays")}</h1>
      {error === "forbidden" ? <Forbidden perm="travel.view" /> : (
        <Panel>
          <FilterBar>
            <FilterField label={tr("جست‌وجو (عنوان، شهر، شریک)", "Search (title, city, partner)")}><TextFilter value={q} onChange={(v) => { setQ(v); setPage(1); }} /></FilterField>
            <FilterField label={tr("وضعیت", "Status")}><SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: tr("همه", "All") }, ...LISTING_STATUSES.map((s) => ({ value: s, label: tr(...LISTING_STATUS_LABEL[s]!) }))]} /></FilterField>
          </FilterBar>
          {error === "error" ? <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message="" retryLabel={tr("تلاش دوباره", "Retry")} onRetry={load} /> : null}
          {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
          {data ? (
            <>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><Th>{tr("اقامتگاه", "Listing")}</Th><Th>{tr("شریک", "Partner")}</Th><Th>{tr("وضعیت", "Status")}</Th><Th>{tr("کامل بودن", "Completeness")}</Th><Th>{tr("ارسال", "Submitted")}</Th></tr></thead>
                  <tbody>
                    {data.items.length === 0 ? <EmptyRow colSpan={5} label={tr("موردی نیست", "Nothing here")} /> : data.items.map((l) => (
                      <tr key={l.id}>
                        <Td><Link className="text-brand-natural" href={`/${lang}/admin/travel/listings/${l.id}`}>{l.title}</Link><span className="block text-metadata text-text-secondary">{listingTypeLabel(l.type, pairLang(lang))} · {l.city}</span></Td>
                        <Td>{l.organization.name}<span className="block text-metadata text-text-secondary">{l.organization.verificationStatus}</span></Td>
                        <Td><Tag tone={l.status === "PUBLISHED" ? "success" : l.status === "PENDING_REVIEW" ? "attention" : l.status === "SUSPENDED" ? "urgent" : "neutral"}>{LISTING_STATUS_LABEL[l.status] ? tr(...LISTING_STATUS_LABEL[l.status]!) : l.status}</Tag>{l.isVerified ? <span className="ms-1"><Tag tone="brand">{tr("تأییدشده", "Verified")}</Tag></span> : null}</Td>
                        <Td>{[l.hasPetPolicy ? null : tr("بدون قوانین حیوان", "no pet policy"), l.unitCount ? null : tr("بدون اتاق", "no rooms"), l.mediaCount ? null : tr("بدون تصویر", "no photos")].filter(Boolean).join(" · ") || "✓"}</Td>
                        <Td>{l.submittedAt ? formatDay(l.submittedAt.slice(0, 10), lang) : "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <Pager page={page} total={data.total} size={25} onPage={setPage} />
            </>
          ) : null}
        </Panel>
      )}
    </div>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const { lang, tr } = useLang();
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span>{localizeDigits(total, lang)} {tr("مورد", "items")}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => onPage(page - 1)}>{tr("قبلی", "Previous")}</Button>
        <Button size="sm" variant="ghost" disabled={page * size >= total} onClick={() => onPage(page + 1)}>{tr("بعدی", "Next")}</Button>
      </div>
    </div>
  );
}

export function AdminTravelListingDetailView({ listingId }: { listingId: string }) {
  const { lang, tr, trf } = useLang();
  const [d, setD] = useState<Awaited<ReturnType<typeof adminTravelService.listing>> | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setD(await adminTravelService.listing(listingId));
    } catch (e) {
      setError(toError(e));
    }
  }, [listingId]);
  useEffect(() => void load(), [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setNote("");
      setMsg({ ok: true, text: ok });
      await load();
    } catch (e) {
      const reason = e instanceof ApiError ? (e.details?.reason as string | undefined) ?? e.code : "";
      if (e instanceof ApiError && e.code === "PARTNER_NOT_VERIFIED") {
        setMsg({ ok: false, text: apiErrorText(e, tr("fa", "en")) });
        return;
      }
      setMsg({ ok: false, text: reason === "PET_POLICY_MISSING" ? (tr("بدون قوانین حیوانات نمی‌توان منتشر کرد.", "Cannot publish without a pet policy.")) : reason === "NO_UNITS" ? (tr("بدون اتاق نمی‌توان منتشر کرد.", "Cannot publish without rooms.")) : e instanceof ApiError && e.status === 403 ? (tr("دسترسی travel.manage لازم است.", "travel.manage permission required.")) : trf("انجام نشد ({reason}).", "Failed ({reason}).", { reason }) });
    } finally {
      setBusy(false);
    }
  };
  if (error === "forbidden") return <Forbidden perm="travel.view" />;
  if (error === "notFound") return <EmptyState title={tr("پیدا نشد", "Not found")} />;
  if (error) return <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message="" retryLabel={tr("تلاش دوباره", "Retry")} onRetry={load} />;
  if (!d) return <Skeleton className="h-96 w-full" />;
  const l = d.listing;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-page-title">{l.title}</h1>
        <Tag tone={l.status === "PUBLISHED" ? "success" : l.status === "PENDING_REVIEW" ? "attention" : "neutral"}>{LISTING_STATUS_LABEL[l.status] ? tr(...LISTING_STATUS_LABEL[l.status]!) : l.status}</Tag>
        {l.isVerified ? <Tag tone="brand">{tr("تأییدشده", "Verified")}</Tag> : null}
      </header>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title={tr("اقدام بررسی", "Moderation")} hint={tr("همهٔ اقدامات در گزارش رویدادها ثبت می‌شوند.", "Every action is audited.")} />
          <label className="flex flex-col gap-1 text-sm">{tr("یادداشت برای شریک (برای درخواست اصلاح/تعلیق الزامی)", "Note to the partner (required to request correction or suspend)")}<textarea dir="auto" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
          <div className="mt-2 flex flex-wrap gap-2">
            {l.status === "PENDING_REVIEW" ? <><Button size="sm" isLoading={busy} onClick={() => void act(() => adminTravelService.moderate(l.id, "APPROVE", note.trim() || undefined), tr("منتشر شد.", "Published."))}>{tr("تأیید و انتشار", "Approve & publish")}</Button><Button size="sm" variant="secondary" disabled={note.trim().length < 3} isLoading={busy} onClick={() => void act(() => adminTravelService.moderate(l.id, "REQUEST_CORRECTION", note.trim()), tr("برای اصلاح برگشت.", "Returned for correction."))}>{tr("درخواست اصلاح", "Request correction")}</Button></> : null}
            {l.status === "PUBLISHED" ? <Button size="sm" variant="danger" disabled={note.trim().length < 3} isLoading={busy} onClick={() => void act(() => adminTravelService.moderate(l.id, "SUSPEND", note.trim()), tr("معلق شد.", "Suspended."))}>{tr("تعلیق", "Suspend")}</Button> : null}
            {l.status === "SUSPENDED" ? <Button size="sm" isLoading={busy} onClick={() => void act(() => adminTravelService.moderate(l.id, "REINSTATE", note.trim() || undefined), tr("دوباره منتشر شد.", "Reinstated."))}>{tr("بازگرداندن", "Reinstate")}</Button> : null}
            <Button size="sm" variant="ghost" disabled={note.trim().length < 3} isLoading={busy} onClick={() => void act(() => adminTravelService.verify(l.id, !l.isVerified, note.trim()), tr("به‌روز شد.", "Updated."))}>{l.isVerified ? (tr("حذف نشان تأیید", "Remove verified badge")) : tr("اعطای نشان تأیید", "Grant verified badge")}</Button>
          </div>
          <p className="mt-2 text-metadata text-text-secondary">{tr("نشان تأیید فقط پس از بررسی مدارک واقعی شریک اعطا شود؛ دلیل آن الزامی است.", "Grant the verified badge only after checking the partner's real documents; a reason is required.")}</p>
        </Panel>
        <Panel>
          <PanelTitle title={tr("شریک", "Partner")} />
          <DetailRow label={tr("نام", "Name")}>{d.organization?.name ?? "—"}</DetailRow>
          <DetailRow label={tr("وضعیت احراز", "Verification")}>{d.organization?.verificationStatus ?? "—"}</DetailRow>
          <DetailRow label={tr("شهر", "City")}>{l.city}{l.province ? `، ${l.province}` : ""}</DetailRow>
          <DetailRow label={tr("نوع رزرو", "Booking mode")}>{l.bookingMode === "REQUEST_TO_BOOK" ? (tr("درخواستی", "Request")) : tr("فوری", "Instant")}</DetailRow>
        </Panel>
        <Panel>
          <PanelTitle title={tr("قوانین حیوانات", "Pet policy")} />
          {policyFacts(l.petPolicy, pairLang(lang)).map((f) => <DetailRow key={f.label} label={f.label}>{f.value}</DetailRow>)}
        </Panel>
        <Panel>
          <PanelTitle title={tr("اتاق‌ها و نرخ‌ها", "Rooms & rates")} />
          {l.units.length === 0 ? <p className="text-sm text-text-secondary">{tr("اتاقی ثبت نشده", "No rooms")}</p> : l.units.map((u) => (
            <div key={u.id} className="border-b border-border-subtle py-2 text-sm last:border-b-0">
              <p className="font-bold">{u.name} · {money(u.basePriceIrr, lang)} · ×{localizeDigits(u.quantity, lang)}{u.isActive ? "" : tr(" (غیرفعال)", " (inactive)")}</p>
              {u.ratePlans.map((p) => <p key={p.id} className="text-metadata text-text-secondary">{p.name}: {cancellationSummary(p, pairLang(lang))}</p>)}
            </div>
          ))}
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelTitle title={tr("توضیحات و تصاویر", "Description & photos")} />
          <p className="whitespace-pre-line text-sm">{l.description}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l.media.map((m) => <img key={m.id} src={m.url} alt={m.alt ?? ""} className="aspect-square rounded-md object-cover" />)}
          </div>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelTitle title={tr("تاریخچهٔ بررسی", "Moderation history")} />
          {d.history.length === 0 ? <p className="text-sm text-text-secondary">{tr("اقدامی ثبت نشده", "No actions yet")}</p> : d.history.map((h, i) => <DetailRow key={i} label={new Intl.DateTimeFormat(tr("fa-IR-u-ca-persian", "en-GB"), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(h.createdAt))}>{h.action}{h.reason ? ` — ${h.reason}` : ""}</DetailRow>)}
        </Panel>
      </div>
    </div>
  );
}

const BOOKING_STATUSES = ["AWAITING_PROVIDER", "AWAITING_PAYMENT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW", "HELD"];

export function AdminTravelBookingsView() {
  const { lang, tr } = useLang();
  const [status, setStatus] = useState<string | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminTravelBookingRow[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminTravelService.bookings({ status: status === "all" ? undefined : status, q: q.trim() || undefined, page }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, q, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <div>
      <h1 className="mb-3 text-page-title">{tr("رزروهای اقامت", "Stay bookings")}</h1>
      {error === "forbidden" ? <Forbidden perm="travel.view" /> : (
        <Panel>
          <FilterBar>
            <FilterField label={tr("کد رزرو یا اقامتگاه", "Reference or listing")}><TextFilter value={q} onChange={(v) => { setQ(v); setPage(1); }} /></FilterField>
            <FilterField label={tr("وضعیت", "Status")}><SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: tr("همه", "All") }, ...BOOKING_STATUSES.map((s) => ({ value: s, label: bookingStatusLabel(s, pairLang(lang)) }))]} /></FilterField>
          </FilterBar>
          {error === "error" ? <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message="" retryLabel={tr("تلاش دوباره", "Retry")} onRetry={load} /> : null}
          {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
          {data ? (
            <>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><Th>{tr("کد", "Ref")}</Th><Th>{tr("اقامتگاه", "Listing")}</Th><Th>{tr("تاریخ", "Dates")}</Th><Th>{tr("وضعیت", "Status")}</Th><Th>{tr("پرداخت", "Payment")}</Th><Th>{tr("مبلغ", "Total")}</Th></tr></thead>
                  <tbody>
                    {data.items.length === 0 ? <EmptyRow colSpan={6} label={tr("رزروی نیست", "No bookings")} /> : data.items.map((b) => (
                      <tr key={b.id}>
                        <Td><Link className="text-brand-natural" dir="ltr" href={`/${lang}/admin/travel/bookings/${b.id}`}>{b.reference}</Link></Td>
                        <Td>{b.listingTitle}<span className="block text-metadata text-text-secondary">{b.providerName} · {b.city}</span></Td>
                        <Td>{formatDay(b.checkIn, lang, { year: false })} — {formatDay(b.checkOut, lang)}</Td>
                        <Td><Tag tone={b.status === "CONFIRMED" || b.status === "COMPLETED" ? "success" : b.status.startsWith("AWAITING") ? "attention" : "neutral"}>{bookingStatusLabel(b.status, pairLang(lang))}</Tag></Td>
                        <Td>{paymentStatusLabel(b.paymentStatus, pairLang(lang))}</Td>
                        <Td>{money(b.totalAmountIrr, lang)}{b.refundAmountIrr ? <span className="block text-metadata text-state-success">{tr("بازپرداخت ", "refunded ")}{money(b.refundAmountIrr, lang)}</span> : null}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <Pager page={page} total={data.total} size={25} onPage={setPage} />
            </>
          ) : null}
        </Panel>
      )}
    </div>
  );
}

export function AdminTravelBookingDetailView({ bookingId }: { bookingId: string }) {
  const { lang, tr } = useLang();
  const [d, setD] = useState<AdminTravelBookingDetail | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setD(await adminTravelService.booking(bookingId));
    } catch (e) {
      setError(toError(e));
    }
  }, [bookingId]);
  useEffect(() => void load(), [load]);
  if (error === "forbidden") return <Forbidden perm="travel.view" />;
  if (error === "notFound") return <EmptyState title={tr("پیدا نشد", "Not found")} />;
  if (error) return <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message="" retryLabel={tr("تلاش دوباره", "Retry")} onRetry={load} />;
  if (!d) return <Skeleton className="h-96 w-full" />;
  const b = d.booking;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3"><h1 className="text-page-title" dir="ltr">{b.reference}</h1><Tag tone="brand">{bookingStatusLabel(b.status, pairLang(lang))}</Tag><Tag>{paymentStatusLabel(b.paymentStatus, pairLang(lang))}</Tag></header>
      <p className="text-metadata text-text-secondary">{tr("نمای عملیاتی فقط‌خواندنی؛ تغییر وضعیت و مبالغ از این صفحه انجام نمی‌شود. برای بازپرداخت یا اختلاف از پشتیبانی/اختلافات استفاده کنید.", "Read-only operational view; status and money are not edited here. Use support/disputes for refunds or disputes.")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title={tr("اقامت", "Stay")} />
          <DetailRow label={tr("اقامتگاه", "Listing")}>{b.listingTitle} · {b.unitName}</DetailRow>
          <DetailRow label={tr("تاریخ", "Dates")}>{stayDates(b, lang)}</DetailRow>
          <DetailRow label={tr("مسافر", "Traveller")}>{d.travelerFirstName}</DetailRow>
          <DetailRow label={tr("حیوانات", "Pets")}>{b.pets.map((p) => p.petName).join("، ") || "—"}</DetailRow>
          <DetailRow label={tr("نرخ", "Rate")}>{b.ratePlan ? `${b.ratePlan.name} — ${cancellationSummary(b.ratePlan, pairLang(lang))}` : b.cancellationPolicySnapshot ?? "—"}</DetailRow>
        </Panel>
        <Panel>
          <PanelTitle title={tr("مالی", "Money")} hint={tr("ریال مرجع است؛ نمایش به تومان", "IRR is the source of truth; shown in Toman")} />
          <DetailRow label={tr("جمع کل", "Total")}>{money(b.totalAmountIrr, lang)}</DetailRow>
          <DetailRow label={tr("آنلاین", "Online")}>{money(b.payNowAmountIrr, lang)}</DetailRow>
          <DetailRow label={tr("بازپرداخت", "Refunded")}>{money(b.refundAmountIrr, lang)}</DetailRow>
          <DetailRow label={tr("پرداخت", "Payment")}>{d.payment ? `${d.payment.provider} · ${d.payment.status} · ${money(d.payment.amount, lang)}` : "—"}</DetailRow>
          {d.refunds.map((r) => <DetailRow key={r.id} label={tr("بازپرداخت", "Refund")}>{`${r.status} · ${money(r.amount, lang)}`}</DetailRow>)}
        </Panel>
        <Panel>
          <PanelTitle title={tr("پشتیبانی مرتبط", "Linked support")} />
          {d.supportCases.length === 0 ? <p className="text-sm text-text-secondary">{tr("پرونده‌ای نیست", "No cases")}</p> : d.supportCases.map((c) => <DetailRow key={c.id} label={c.caseNumber}><Link className="text-brand-natural" href={`/${lang}/admin/support/${c.id}`}>{c.subject}</Link> · {c.status}</DetailRow>)}
        </Panel>
        <Panel>
          <PanelTitle title={tr("تاریخچه", "Timeline")} />
          {b.timeline.map((e, i) => <DetailRow key={i} label={new Intl.DateTimeFormat(tr("fa-IR-u-ca-persian", "en-GB"), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(e.createdAt))}>{`${e.actorType} → ${bookingStatusLabel(e.toStatus, pairLang(lang))}${e.reason ? ` (${e.reason})` : ""}`}</DetailRow>)}
        </Panel>
      </div>
    </div>
  );
}

export function AdminTravelReviewsView() {
  const { lang, tr } = useLang();
  const [status, setStatus] = useState<string | "all">("all");
  const [data, setData] = useState<{ total: number; items: AdminTravelReviewRow[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminTravelService.reviews({ status: status === "all" ? undefined : status }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status]);
  useEffect(() => void load(), [load]);
  const toggle = async (r: AdminTravelReviewRow) => {
    try {
      await adminTravelService.reviewVisibility(r.id, r.status === "PUBLISHED", (reason[r.id] ?? "").trim());
      await load();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  };
  return (
    <div>
      <h1 className="mb-3 text-page-title">{tr("نظرات اقامت", "Stay reviews")}</h1>
      {error === "forbidden" ? <Forbidden perm="travel.manage" /> : (
        <Panel>
          <FilterBar><FilterField label={tr("وضعیت", "Status")}><SelectFilter value={status} onChange={setStatus} options={[{ value: "all", label: tr("همه", "All") }, { value: "PUBLISHED", label: tr("منتشر", "Published") }, { value: "HIDDEN", label: tr("پنهان", "Hidden") }]} /></FilterField></FilterBar>
          {!data ? <Skeleton className="h-40" /> : data.items.length === 0 ? <p className="text-sm text-text-secondary">{tr("نظری نیست", "No reviews")}</p> : (
            <ul className="flex flex-col gap-3">{data.items.map((r) => (
              <li key={r.id} className="rounded-md border border-border-subtle p-3 text-sm">
                <p><span className="font-bold">{r.listingTitle}</span> · {"★".repeat(r.overall)} · {formatDay(r.createdAt.slice(0, 10), lang)} · <Tag tone={r.status === "PUBLISHED" ? "success" : "neutral"}>{r.status === "PUBLISHED" ? (tr("منتشر", "Published")) : tr("پنهان", "Hidden")}</Tag></p>
                {r.body ? <p className="mt-1">{r.body}</p> : null}
                {r.hiddenReason ? <p className="text-metadata text-text-secondary">{tr("علت پنهان‌سازی: ", "Hidden because: ")}{r.hiddenReason}</p> : null}
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Input label={tr("علت (الزامی، ثبت در گزارش رویداد)", "Reason (required, audited)")} value={reason[r.id] ?? ""} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} />
                  <Button size="sm" variant={r.status === "PUBLISHED" ? "danger" : "secondary"} disabled={(reason[r.id] ?? "").trim().length < 3} onClick={() => void toggle(r)}>{r.status === "PUBLISHED" ? (tr("پنهان کردن", "Hide")) : tr("انتشار دوباره", "Republish")}</Button>
                </div>
              </li>
            ))}</ul>
          )}
        </Panel>
      )}
    </div>
  );
}

const EMPTY_RULE: RequirementRuleInput = { country: "IR", city: "", requirementType: "RABIES" as TravelRequirementType, title: "", description: "", source: "", sourceUrl: "", verifiedAt: new Date().toISOString().slice(0, 10), validUntil: "", status: "ACTIVE", species: [] };

/** Requirement library: every rule carries its source and verification date; nothing is inferred. */
export function AdminTravelRequirementsView() {
  const { lang, tr } = useLang();
  const [rules, setRules] = useState<TravelRequirementRuleDto[] | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [form, setForm] = useState<RequirementRuleInput & { id?: string }>(EMPTY_RULE);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      setRules(await adminTravelService.rules());
    } catch (e) {
      setError(toError(e));
    }
  }, []);
  useEffect(() => void load(), [load]);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const input: RequirementRuleInput = { ...form, city: form.city?.trim() || null, sourceUrl: form.sourceUrl?.trim() || null, validUntil: form.validUntil ? new Date(`${form.validUntil}T00:00:00Z`).toISOString() : null, verifiedAt: new Date(`${form.verifiedAt.slice(0, 10)}T00:00:00Z`).toISOString(), country: form.country.toUpperCase() };
    delete (input as { id?: string }).id;
    try {
      if (form.id) await adminTravelService.updateRule(form.id, input);
      else await adminTravelService.createRule(input);
      setForm(EMPTY_RULE);
      setMsg({ ok: true, text: tr("ذخیره شد.", "Saved.") });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError && e.status === 403 ? (tr("دسترسی travel.requirements.manage لازم است.", "travel.requirements.manage permission required.")) : tr("ذخیره نشد؛ منبع، تاریخ بررسی (نه آینده) و توضیح را بررسی کنید.", "Not saved; check source, verification date (not in the future) and description.") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <h1 className="mb-3 text-page-title">{tr("کتابخانهٔ الزامات سفر", "Travel requirement library")}</h1>
      {error === "forbidden" ? <Forbidden perm="travel.view" /> : (
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelTitle title={form.id ? (tr("ویرایش قاعده", "Edit rule")) : tr("قاعدهٔ تازه", "New rule")} hint={tr("فقط الزاماتی که منبع رسمی دارند. قاعدهٔ قدیمی‌تر از ۱۸۰ روز «نیازمند بازبینی» نمایش داده می‌شود.", "Only requirements with an official source. Rules verified over 180 days ago show as needing review.")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={tr("کشور (کد دوحرفی)", "Country (2-letter)")} dir="ltr" maxLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <Input label={tr("شهر (اختیاری)", "City (optional)")} value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <label className="flex flex-col gap-1 text-sm">{tr("نوع", "Type")}<select value={form.requirementType} onChange={(e) => setForm({ ...form, requirementType: e.target.value as TravelRequirementType })} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">{REQUIREMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              <label className="flex flex-col gap-1 text-sm">{tr("وضعیت", "Status")}<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RequirementRuleInput["status"] })} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2"><option value="ACTIVE">ACTIVE</option><option value="NEEDS_REVIEW">NEEDS_REVIEW</option><option value="RETIRED">RETIRED</option></select></label>
              <Input label={tr("عنوان", "Title")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <Input label={tr("منبع (نهاد رسمی)", "Source (official body)")} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              <Input label={tr("پیوند منبع (https)", "Source URL (https)")} dir="ltr" value={form.sourceUrl ?? ""} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
              <Input label={tr("تاریخ بررسی (میلادی YYYY-MM-DD)", "Verified on (YYYY-MM-DD)")} dir="ltr" value={form.verifiedAt.slice(0, 10)} onChange={(e) => setForm({ ...form, verifiedAt: e.target.value })} hint={form.verifiedAt.length >= 10 ? formatDay(form.verifiedAt.slice(0, 10), lang) : undefined} />
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">{tr("شرح الزام", "Description")}<textarea dir="auto" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
            </div>
            {msg ? <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button isLoading={busy} disabled={form.title.trim().length < 3 || form.description.trim().length < 3 || form.source.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}/.test(form.verifiedAt)} onClick={() => void save()}>{tr("ذخیره", "Save")}</Button>
              {form.id ? <Button variant="ghost" onClick={() => setForm(EMPTY_RULE)}>{tr("انصراف", "Cancel")}</Button> : null}
            </div>
          </Panel>
          <Panel>
            {!rules ? <Skeleton className="h-40" /> : (
              <TableWrap>
                <table className="w-full">
                  <thead><tr><Th>{tr("قاعده", "Rule")}</Th><Th>{tr("حوزه", "Jurisdiction")}</Th><Th>{tr("منبع", "Source")}</Th><Th>{tr("بررسی", "Verified")}</Th><Th>{tr("وضعیت", "Status")}</Th></tr></thead>
                  <tbody>
                    {rules.length === 0 ? <EmptyRow colSpan={5} label={tr("قاعده‌ای ثبت نشده", "No rules yet")} /> : rules.map((r) => (
                      <tr key={r.id}>
                        <Td><button className="text-start text-brand-natural" onClick={() => setForm({ id: r.id, country: r.country, city: r.city ?? "", requirementType: r.requirementType, title: r.title, description: r.description, source: r.source, sourceUrl: r.sourceUrl ?? "", verifiedAt: r.verifiedAt.slice(0, 10), validUntil: r.validUntil?.slice(0, 10) ?? "", status: r.status, species: r.species })}>{r.title}</button><span className="block text-metadata text-text-secondary">{r.requirementType}</span></Td>
                        <Td>{r.country}{r.city ? ` / ${r.city}` : ""}</Td>
                        <Td>{externalHref(r.sourceUrl) ? <a className="underline" href={externalHref(r.sourceUrl)!} target="_blank" rel="noopener noreferrer">{r.source}</a> : r.source}</Td>
                        <Td>{formatDay(r.verifiedAt.slice(0, 10), lang)}{r.isStale ? <span className="block"><Tag tone="attention">{tr("نیازمند بازبینی", "Needs review")}</Tag></span> : null}</Td>
                        <Td><Tag tone={r.status === "ACTIVE" ? "success" : r.status === "NEEDS_REVIEW" ? "attention" : "neutral"}>{r.status}</Tag></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

export function AdminTravelPartnersView() {
  const { lang, tr } = useLang();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminTravelService.partners>> | null>(null);
  const [error, setError] = useState<LoadError>(null);
  useEffect(() => {
    adminTravelService.partners().then(setRows).catch((e) => setError(toError(e)));
  }, []);
  return (
    <div>
      <h1 className="mb-3 text-page-title">{tr("شرکای اقامتی", "Travel partners")}</h1>
      {error === "forbidden" ? <Forbidden perm="travel.view" /> : error ? <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message="" retryLabel={tr("تلاش دوباره", "Retry")} onRetry={() => location.reload()} /> : (
        <Panel>
          {!rows ? <Skeleton className="h-40" /> : (
            <TableWrap>
              <table className="w-full">
                <thead><tr><Th>{tr("نام", "Name")}</Th><Th>{tr("احراز", "Verification")}</Th><Th>{tr("اقامتگاه‌ها", "Listings")}</Th><Th>{tr("رزروها", "Bookings")}</Th></tr></thead>
                <tbody>{rows.length === 0 ? <EmptyRow colSpan={4} label={tr("شریکی نیست", "No partners")} /> : rows.map((r) => <tr key={r.id}><Td>{r.name}</Td><Td>{r.verificationStatus}</Td><Td>{localizeDigits(r.listingCount, lang)}</Td><Td>{localizeDigits(r.bookingCount, lang)}</Td></tr>)}</tbody>
              </table>
            </TableWrap>
          )}
          <p className="mt-2 text-metadata text-text-secondary">{tr("احراز هویت شریک در بخش «ارائه‌دهندگان» انجام می‌شود.", "Partner verification is handled in the Providers section.")} <Link className="underline" href={`/${lang}/admin/providers`}>{tr("ارائه‌دهندگان", "Providers")}</Link></p>
        </Panel>
      )}
    </div>
  );
}

export function AdminTravelAnalyticsView() {
  const { lang, tr, trf } = useLang();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<AdminTravelAnalyticsDto | null>(null);
  const [error, setError] = useState<LoadError>(null);
  useEffect(() => {
    setD(null);
    adminTravelService.analytics(days).then(setD).catch((e) => setError(toError(e)));
  }, [days]);
  const pct = (v: number | null) => (v === null ? "—" : `${localizeDigits((v * 100).toFixed(1), lang)}٪`);
  return (
    <div>
      <h1 className="mb-3 text-page-title">{tr("گزارش سفر", "Travel analytics")}</h1>
      {error === "forbidden" ? <Forbidden perm="travel.view" /> : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">{[7, 30, 90].map((n) => <Button key={n} size="sm" aria-pressed={days === n} variant={days === n ? "primary" : "ghost"} onClick={() => setDays(n)}>{trf("{n} روز", "{n} days", { n: localizeDigits(n, lang) })}</Button>)}</div>
          {!d ? <Skeleton className="h-40" /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label={tr("رزروها", "Bookings")} value={localizeDigits(d.bookingCount, lang)} sub={trf("{n} تأییدشده", "{n} confirmed", { n: localizeDigits(d.confirmedCount, lang) })} />
                <Kpi label={tr("ارزش رزروها", "Booked value")} value={money(d.bookedValueIrr, lang)} />
                <Kpi label={tr("دریافت آنلاین", "Paid online")} value={money(d.paidValueIrr, lang)} sub={trf("بازپرداخت {amount}", "refunded {amount}", { amount: money(d.refundedIrr, lang) })} />
                <Kpi label={tr("نرخ لغو", "Cancellation rate")} value={pct(d.cancellationRate)} sub={d.averageRating !== null ? trf("امتیاز {rating} از {count} نظر", "rating {rating} from {count} reviews", { rating: localizeDigits(d.averageRating.toFixed(1), lang), count: localizeDigits(d.reviewCount, lang) }) : undefined} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel><PanelTitle title={tr("مقصدهای پررزرو", "Top destinations")} />{d.topDestinations.length ? d.topDestinations.map((t) => <DetailRow key={t.city} label={t.city}>{localizeDigits(t.bookings, lang)}</DetailRow>) : <p className="text-sm text-text-secondary">—</p>}</Panel>
                <Panel><PanelTitle title={tr("شرکای پررزرو", "Top partners")} />{d.topProviders.length ? d.topProviders.map((t) => <DetailRow key={t.organizationId} label={t.name}>{`${localizeDigits(t.bookings, lang)} · ${money(t.bookedValueIrr, lang)}`}</DetailRow>) : <p className="text-sm text-text-secondary">—</p>}</Panel>
              </div>
              <p className="text-metadata text-text-secondary">{tr("ارقام واقعی از رزروها؛ تسویه با شرکا خودکار نیست و برآورد نمی‌شود.", "Real figures from bookings; partner payouts are not automated and are not estimated.")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const APP_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "APPROVED", "DECLINED", "CANCELLED", "DRAFT"];

/** Admin insurance: oversight only — PET LIFE never decides an application. */
export function AdminInsuranceApplicationsView() {
  const { lang, tr } = useLang();
  const [status, setStatus] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminInsuranceApplicationRow[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminInsuranceOpsService.applications({ status: status === "all" ? undefined : status, page }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, page]);
  useEffect(() => void load(), [load]);
  return (
    <div>
      <h1 className="mb-3 text-page-title">{tr("درخواست‌های بیمه", "Insurance applications")}</h1>
      <p className="mb-3 text-sm text-text-secondary">{tr("تصمیم‌گیری دربارهٔ درخواست‌ها فقط با بیمه‌گر است. اعضای بیمه‌گر را از صفحهٔ هر بیمه‌گر مدیریت کنید.", "Only the insurer decides applications. Manage insurer members from each insurer's page.")}</p>
      {error === "forbidden" ? <Forbidden perm="insurance.applications.view" /> : (
        <Panel>
          <FilterBar><FilterField label={tr("وضعیت", "Status")}><SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: tr("همه", "All") }, ...APP_STATUSES.map((s) => ({ value: s, label: s }))]} /></FilterField></FilterBar>
          {error === "error" ? <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message="" retryLabel={tr("تلاش دوباره", "Retry")} onRetry={load} /> : null}
          {!data && !error ? <Skeleton className="h-64" /> : null}
          {data ? (
            <>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><Th>{tr("محصول", "Product")}</Th><Th>{tr("گونه", "Species")}</Th><Th>{tr("وضعیت", "Status")}</Th><Th>{tr("رضایت", "Consent")}</Th><Th>{tr("ارسال", "Submitted")}</Th></tr></thead>
                  <tbody>{data.items.length === 0 ? <EmptyRow colSpan={5} label={tr("درخواستی نیست", "No applications")} /> : data.items.map((a) => (
                    <tr key={a.id}><Td>{a.productName}<span className="block text-metadata text-text-secondary">{a.providerName}</span></Td><Td>{a.petSpecies}</Td><Td><Tag tone={a.status === "APPROVED" ? "success" : a.status === "NEEDS_INFORMATION" || a.status === "SUBMITTED" ? "attention" : "neutral"}>{a.status}</Tag></Td><Td>{a.consentAt ? formatDay(a.consentAt.slice(0, 10), lang) : "—"}</Td><Td>{a.submittedAt ? formatDay(a.submittedAt.slice(0, 10), lang) : "—"}</Td></tr>
                  ))}</tbody>
                </table>
              </TableWrap>
              <Pager page={page} total={data.total} size={25} onPage={setPage} />
            </>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
