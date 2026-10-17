"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, Dialog, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { MedicalDocumentDto, TravelBookingDto, TripListItemDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { addDays, daysBetween, formatDay, localizeDigits, todayIso } from "@/lib/date/jalali";
import { DateRangeField, type DateRangeValue } from "@/features/shared/date-picker/DateRangePicker";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { bookingStatusLabel, bookingStatusTone, cancellationSummary, money, paymentStatusLabel, paymentTimingSummary, policyFacts, stayDates } from "./labels";

const EVENT_LABEL: Record<string, [string, string]> = {
  DOCUMENT_SHARED: ["مدرک به اشتراک گذاشته شد", "Document shared"],
  DOCUMENT_REVOKED: ["اشتراک مدرک لغو شد", "Document sharing revoked"],
  MORE_INFO_NEEDED: ["با اطلاعات ناقص حیوان ثبت شد", "Held with incomplete pet information"],
};

/**
 * TRIP / MANAGE BOOKING. The page shows the booking's frozen terms and the server's own verdicts:
 * whether it can still be cancelled or changed, and the exact refund the terms give today.
 */
export function TravelBookingDetailView({ bookingId }: { bookingId: string }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const router = useRouter();
  const [b, setB] = useState<TravelBookingDto | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [dialog, setDialog] = useState<"cancel" | "modify" | "review" | "share" | "trip" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchBooking = useCallback(async () => {
    try {
      setB(await travelMarketService.getBooking(bookingId));
      setLoad("ready");
    } catch (e) {
      setLoad(e instanceof ApiError && e.status === 404 ? "notFound" : "error");
    }
  }, [bookingId]);
  useEffect(() => void fetchBooking(), [fetchBooking]);

  if (load === "loading") return <div className="flex flex-col gap-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  if (load === "notFound") return <div className="mx-auto max-w-3xl py-6"><EmptyState title={fa ? "این رزرو پیدا نشد" : "Booking not found"} actionLabel={fa ? "سفرهای من" : "My trips"} onAction={() => router.push(`/${lang}/travel/trips`)} /></div>;
  if (load === "error" || !b) return <div className="mx-auto max-w-3xl py-6"><ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void fetchBooking()} /></div>;

  const run = async (fn: () => Promise<TravelBookingDto | unknown>, ok: string, fail: (e: unknown) => string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res && typeof res === "object" && "reference" in (res as object)) setB(res as TravelBookingDto);
      else await fetchBooking();
      setNotice(ok);
      setDialog(null);
    } catch (e) {
      setError(fail(e));
    } finally {
      setBusy(false);
    }
  };

  const bd = b.priceBreakdown;
  const activeShares = b.documentShares.filter((s) => s.isActive);
  const canShare = ["AWAITING_PROVIDER", "AWAITING_PAYMENT", "CONFIRMED", "IN_PROGRESS"].includes(b.status);

  return (
    <div className="flex w-full flex-col gap-6">
      <nav className="text-metadata text-text-secondary" aria-label={fa ? "مسیر" : "Breadcrumb"}><Link href={`/${lang}/travel/trips`} className="hover:underline">{fa ? "سفرهای من" : "My trips"}</Link></nav>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={bookingStatusTone(b.status)}>{bookingStatusLabel(b.status, lang)}</StatusLabel>
          <span className="text-metadata text-text-secondary">{paymentStatusLabel(b.paymentStatus, lang)}</span>
        </div>
        <h1 className="text-page-title text-text-primary">{b.listingTitle}</h1>
        <p className="text-body text-text-primary">{stayDates(b, lang)}</p>
        <p className="text-metadata text-text-secondary">{b.unitName}{b.ratePlan ? ` · ${b.ratePlan.name}` : ""} · {b.listingCity} · {fa ? "کد " : "Ref "}<span dir="ltr" className="whitespace-nowrap font-mono">{b.reference}</span></p>
      </header>
      {notice ? <p role="status" className="rounded-md bg-state-success/10 p-3 text-sm text-state-success">{notice}</p> : null}

      <div className="split-layout">
        <div className="split-main">
      <section aria-labelledby="pets" className="split-section flex flex-col gap-2">
        <h2 id="pets" className="text-section-title">{fa ? "حیوانات و قوانین (همان زمان رزرو)" : "Pets and rules (as at booking)"}</h2>
        <p className="text-sm">{b.pets.map((p) => p.petName).join(fa ? "، " : ", ") || (fa ? "بدون حیوان" : "No pets")}</p>
        <details className="text-sm">
          <summary className="cursor-pointer text-text-secondary">{fa ? "قوانین حیوانات اقامتگاه" : "Property pet rules"}</summary>
          <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">{policyFacts(b.petPolicySnapshot, lang).map((f) => <div key={f.label} className="flex justify-between gap-3 border-b border-border-subtle py-1.5"><dt className="text-text-secondary">{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
        </details>
      </section>

      <section aria-labelledby="docs" className="split-section flex flex-col gap-2">
        <h2 id="docs" className="text-section-title">{fa ? "مدارک به‌اشتراک‌گذاشته" : "Shared documents"}</h2>
        {b.documentShares.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "مدرکی با اقامتگاه به اشتراک گذاشته نشده است." : "No documents shared with the property."}</p> : (
          <ul className="split-section flex flex-col gap-2">
            {b.documentShares.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle p-3 text-sm">
                <span>{s.title} <span className="text-text-secondary">· {s.isActive ? (fa ? `تا ${formatDay(s.expiresAt.slice(0, 10), lang)}` : `until ${formatDay(s.expiresAt.slice(0, 10), lang)}`) : s.revokedAt ? (fa ? "لغو شده" : "revoked") : fa ? "منقضی" : "expired"}</span></span>
                {s.isActive ? <Button size="sm" variant="ghost" isLoading={busy} onClick={() => void run(() => travelMarketService.revokeDocument(b.id, s.id), fa ? "دسترسی اقامتگاه به مدرک لغو شد." : "The property's access was revoked.", () => (fa ? "لغو دسترسی انجام نشد." : "Could not revoke."))}>{fa ? "لغو دسترسی" : "Revoke"}</Button> : null}
              </li>
            ))}
          </ul>
        )}
        {activeShares.length ? <p className="text-metadata text-text-secondary">{fa ? "اقامتگاه فقط همین مدارک را، از طریق پیوند امضاشدهٔ کوتاه‌مدت، می‌بیند." : "The property sees only these documents, through short-lived signed links."}</p> : null}
      </section>

      <section aria-labelledby="timeline" className="split-section flex flex-col gap-2">
        <h2 id="timeline" className="text-section-title">{fa ? "تاریخچه" : "Timeline"}</h2>
        <ol className="flex flex-col gap-2 border-s border-border-subtle ps-4">
          {b.timeline.map((e, i) => (
            <li key={i} className="text-sm">
              <span className="font-bold">{e.fromStatus === e.toStatus && e.reason ? (EVENT_LABEL[e.reason.split(":")[0]!]?.[fa ? 0 : 1] ?? e.reason) : bookingStatusLabel(e.toStatus, lang)}</span>
              <span className="text-text-secondary"> · {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(e.createdAt))}</span>
              {e.reason && e.fromStatus !== e.toStatus && !EVENT_LABEL[e.reason] ? <span className="block text-text-secondary">{e.reason}</span> : null}
            </li>
          ))}
        </ol>
      </section>
        </div>
        <aside className="split-aside">
      {b.status === "HELD" ? <Link className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-solid px-5 font-bold text-on-brand" href={`/${lang}/travel/book/${b.id}`}>{fa ? "ادامهٔ رزرو" : "Continue booking"}</Link> : null}
      {b.status === "AWAITING_PAYMENT" ? <Link className="inline-flex min-h-11 w-fit items-center rounded-full bg-brand-solid px-5 font-bold text-on-brand" href={`/${lang}/travel/book/${b.id}`}>{fa ? `پرداخت ${money(b.payNowAmountIrr, lang)}` : `Pay ${money(b.payNowAmountIrr, lang)}`}</Link> : null}
      {b.status === "AWAITING_PROVIDER" && b.requestExpiresAt ? <p className="rounded-md bg-surface-subtle p-3 text-sm">{fa ? `اقامتگاه تا ${formatDay(b.requestExpiresAt.slice(0, 10), lang)} فرصت پاسخ دارد؛ در غیر این صورت درخواست منقضی می‌شود.` : `The property has until ${formatDay(b.requestExpiresAt.slice(0, 10), lang)} to answer; otherwise the request expires.`}</p> : null}
      {b.providerNote ? <p className="rounded-md bg-surface-subtle p-3 text-sm"><span className="font-bold">{fa ? "پیام اقامتگاه: " : "From the property: "}</span>{b.providerNote}</p> : null}

      <section aria-labelledby="terms" className="split-panel flex flex-col gap-2">
        <h2 id="terms" className="text-section-title">{fa ? "مبلغ و شرایط" : "Price and terms"}</h2>
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between font-bold"><dt>{fa ? "جمع کل" : "Total"}</dt><dd className="tabular-nums">{money(b.totalAmountIrr, lang)}</dd></div>
          {bd?.petFeeIrr ? <div className="flex justify-between"><dt>{fa ? "شامل هزینهٔ حیوان" : "Incl. pet fee"}</dt><dd className="tabular-nums">{money(bd.petFeeIrr, lang)}</dd></div> : null}
          <div className="flex justify-between"><dt>{fa ? "پرداخت آنلاین" : "Paid / due online"}</dt><dd className="tabular-nums">{money(b.payNowAmountIrr, lang)}</dd></div>
          {bd?.payLaterIrr ? <div className="flex justify-between"><dt>{fa ? "پرداخت در محل" : "At the property"}</dt><dd className="tabular-nums">{money(bd.payLaterIrr, lang)}</dd></div> : null}
          {b.refundAmountIrr ? <div className="flex justify-between text-state-success"><dt>{fa ? "بازپرداخت" : "Refunded"}</dt><dd className="tabular-nums">{money(b.refundAmountIrr, lang)}</dd></div> : null}
        </dl>
        <p className="text-sm"><span className="font-bold">{fa ? "لغو: " : "Cancellation: "}</span>{b.ratePlan ? cancellationSummary(b.ratePlan, lang) : b.cancellationPolicySnapshot ?? (fa ? "اعلام نشده" : "Not specified")}</p>
        <p className="text-sm"><span className="font-bold">{fa ? "پرداخت: " : "Payment: "}</span>{paymentTimingSummary(b.ratePlan, lang)}</p>
        {b.cancelReason ? <p className="text-sm text-text-secondary">{fa ? "علت لغو: " : "Cancellation reason: "}{b.cancelReason}</p> : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {b.canModify ? <Button variant="secondary" onClick={() => { setError(null); setDialog("modify"); }}>{fa ? "تغییر تاریخ" : "Change dates"}</Button> : null}
        {b.canCancel ? <Button variant="secondary" onClick={() => { setError(null); setDialog("cancel"); }}>{fa ? "لغو رزرو" : "Cancel booking"}</Button> : null}
        {b.canReview ? <Button onClick={() => { setError(null); setDialog("review"); }}>{fa ? "ثبت نظر" : "Write a review"}</Button> : null}
        {canShare ? <Button variant="secondary" onClick={() => { setError(null); setDialog("share"); }}>{fa ? "اشتراک مدرک با اقامتگاه" : "Share a document"}</Button> : null}
        {!b.tripId && !["CANCELLED", "EXPIRED", "REJECTED", "MODIFIED"].includes(b.status) ? <Button variant="ghost" onClick={() => { setError(null); setDialog("trip"); }}>{fa ? "افزودن به سفر" : "Add to a trip"}</Button> : null}
        {b.tripId ? <Link className="inline-flex min-h-11 items-center rounded-full border border-border-subtle px-4 text-sm" href={`/${lang}/travel/trips/${b.tripId}`}>{fa ? "مشاهدهٔ سفر" : "View trip"}</Link> : null}
        <Link className="inline-flex min-h-11 items-center rounded-full border border-border-subtle px-4 text-sm" href={`/${lang}/support/new?relatedEntityType=TRAVEL_BOOKING&relatedEntityId=${b.id}&category=BOOKING`}>{fa ? "درخواست پشتیبانی" : "Get help"}</Link>
      </div>
        </aside>
      </div>

      <Dialog open={dialog === "cancel"} onClose={() => setDialog(null)} title={fa ? "لغو رزرو" : "Cancel booking"}>
        <CancelForm booking={b} busy={busy} error={error} onSubmit={(reason) => void run(() => travelMarketService.cancel(b.id, reason), fa ? "رزرو لغو شد." : "The booking was cancelled.", () => (fa ? "لغو انجام نشد. ممکن است وضعیت رزرو تغییر کرده باشد." : "Could not cancel; the booking may have changed."))} />
      </Dialog>
      <Dialog open={dialog === "modify"} onClose={() => setDialog(null)} title={fa ? "تغییر تاریخ" : "Change dates"}>
        <ModifyForm booking={b} busy={busy} error={error} onSubmit={(v) => void run(async () => { const nb = await travelMarketService.modify(b.id, v); router.replace(`/${lang}/travel/bookings/${nb.id}`); return nb; }, fa ? "تاریخ‌ها تغییر کرد." : "Dates changed.", (e) => (e instanceof ApiError && e.code === "TRAVEL_MODIFICATION_REQUIRES_REBOOKING" ? (fa ? "مبلغ این تغییر با مبلغ پرداختی فرق دارد؛ برای این تغییر رزرو را لغو و دوباره رزرو کنید." : "This change would alter the amount paid. Cancel and book again for this change.") : e instanceof ApiError && e.status === 409 ? (fa ? "این تاریخ‌ها در دسترس نیستند. رزرو فعلی بدون تغییر ماند." : "Those dates are not available. Your booking is unchanged.") : fa ? "تغییر انجام نشد. رزرو فعلی بدون تغییر ماند." : "The change failed. Your booking is unchanged."))} />
      </Dialog>
      <Dialog open={dialog === "review"} onClose={() => setDialog(null)} title={fa ? "نظر شما دربارهٔ اقامت" : "Review your stay"}>
        <ReviewForm busy={busy} error={error} onSubmit={(v) => void run(() => travelMarketService.review(b.id, v), fa ? "نظر شما ثبت شد. سپاس!" : "Thanks — your review was published.", () => (fa ? "ثبت نظر انجام نشد." : "Could not submit the review."))} />
      </Dialog>
      <Dialog open={dialog === "share"} onClose={() => setDialog(null)} title={fa ? "اشتراک مدرک با اقامتگاه" : "Share a document"}>
        {dialog === "share" ? <ShareForm booking={b} busy={busy} error={error} onSubmit={(v) => void run(() => travelMarketService.shareDocument(b.id, v), fa ? "مدرک به اشتراک گذاشته شد." : "Document shared.", () => (fa ? "اشتراک انجام نشد." : "Could not share."))} /> : null}
      </Dialog>
      <Dialog open={dialog === "trip"} onClose={() => setDialog(null)} title={fa ? "افزودن به سفر" : "Add to a trip"}>
        {dialog === "trip" ? <TripForm booking={b} busy={busy} error={error} onSubmit={(tripId) => void run(() => travelMarketService.attachTrip(b.id, tripId), fa ? "به سفر اضافه شد." : "Added to the trip.", () => (fa ? "افزودن انجام نشد." : "Could not add."))} /> : null}
      </Dialog>
    </div>
  );
}

function CancelForm({ booking, busy, error, onSubmit }: { booking: TravelBookingDto; busy: boolean; error: string | null; onSubmit: (reason?: string) => void }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [reason, setReason] = useState("");
  const refund = booking.refundPreviewIrr;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {booking.paymentStatus === "PAID" ? (
        <p className="rounded-md bg-surface-subtle p-3">{refund !== null ? (fa ? `طبق شرایط این رزرو، اگر همین حالا لغو کنید ${money(refund, lang)} از ${money(booking.payNowAmountIrr, lang)} پرداختی بازگردانده می‌شود.` : `Under this booking's terms, cancelling now refunds ${money(refund, lang)} of the ${money(booking.payNowAmountIrr, lang)} paid.`) : fa ? "مبلغ بازپرداخت طبق شرایط رزرو محاسبه می‌شود." : "The refund is calculated from the booking's terms."}</p>
      ) : <p className="rounded-md bg-surface-subtle p-3">{fa ? "مبلغی آنلاین پرداخت نشده است؛ لغو هزینه‌ای ندارد." : "Nothing was paid online, so there is nothing to refund."}</p>}
      <p>{booking.ratePlan ? cancellationSummary(booking.ratePlan, lang) : null}</p>
      <label className="flex flex-col gap-1"><span>{fa ? "علت (اختیاری)" : "Reason (optional)"}</span><textarea dir="auto" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}
      <Button variant="danger" isLoading={busy} onClick={() => onSubmit(reason.trim() || undefined)}>{fa ? "لغو رزرو" : "Cancel booking"}</Button>
    </div>
  );
}

function ModifyForm({ booking, busy, error, onSubmit }: { booking: TravelBookingDto; busy: boolean; error: string | null; onSubmit: (v: { checkIn: string; checkOut: string }) => void }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [range, setRange] = useState<DateRangeValue>({ start: booking.checkIn.slice(0, 10), end: booking.checkOut.slice(0, 10) });
  const changed = range.start !== booking.checkIn.slice(0, 10) || range.end !== booking.checkOut.slice(0, 10);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-text-secondary">{fa ? "تغییر فقط وقتی انجام می‌شود که مبلغ پرداختی ثابت بماند و تاریخ‌های جدید در دسترس باشند. اگر ممکن نباشد، رزرو فعلی بدون تغییر می‌ماند." : "A change goes through only when the amount paid stays the same and the new dates are available. Otherwise your booking stays as it is."}</p>
      <DateRangeField label={fa ? "تاریخ‌های جدید" : "New dates"} value={range} onChange={setRange} min={todayIso()} max={addDays(todayIso(), 365)} />
      {range.start && range.end ? <p>{fa ? `${localizeDigits(daysBetween(range.start, range.end), "fa")} شب` : `${daysBetween(range.start, range.end)} nights`}</p> : null}
      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}
      <Button disabled={!changed || !range.start || !range.end} isLoading={busy} onClick={() => range.start && range.end && onSubmit({ checkIn: range.start, checkOut: range.end })}>{fa ? "درخواست تغییر" : "Change dates"}</Button>
    </div>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const lang = useLocale() as "fa" | "en";
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border-subtle has-[:checked]:bg-brand-solid has-[:checked]:text-on-brand">
            <input type="radio" className="sr-only" name={label} checked={value === n} onChange={() => onChange(n)} />
            {localizeDigits(n, lang)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewForm({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (v: { overall: number; petFriendliness?: number; cleanliness?: number; location?: number; body?: string }) => void }) {
  const fa = (useLocale() as string) === "fa";
  const [overall, setOverall] = useState(0);
  const [pet, setPet] = useState(0);
  const [clean, setClean] = useState(0);
  const [loc, setLoc] = useState(0);
  const [body, setBody] = useState("");
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Stars label={fa ? "امتیاز کلی" : "Overall"} value={overall} onChange={setOverall} />
      <Stars label={fa ? "رفتار با حیوانات" : "Pet friendliness"} value={pet} onChange={setPet} />
      <Stars label={fa ? "تمیزی" : "Cleanliness"} value={clean} onChange={setClean} />
      <Stars label={fa ? "موقعیت" : "Location"} value={loc} onChange={setLoc} />
      <label className="flex flex-col gap-1"><span>{fa ? "تجربهٔ شما (اختیاری)" : "Your experience (optional)"}</span><textarea dir="auto" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-24 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
      <p className="text-metadata text-text-secondary">{fa ? "نظر با نام کوچک شما و ماه اقامت منتشر می‌شود." : "Published with your first name and the month of your stay."}</p>
      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}
      <Button disabled={!overall} isLoading={busy} onClick={() => onSubmit({ overall, petFriendliness: pet || undefined, cleanliness: clean || undefined, location: loc || undefined, body: body.trim() || undefined })}>{fa ? "انتشار نظر" : "Publish review"}</Button>
    </div>
  );
}

function ShareForm({ booking, busy, error, onSubmit }: { booking: TravelBookingDto; busy: boolean; error: string | null; onSubmit: (v: { medicalDocumentId: string; purpose: string }) => void }) {
  const fa = (useLocale() as string) === "fa";
  const [docs, setDocs] = useState<(MedicalDocumentDto & { petName: string })[] | null>(null);
  const [docId, setDocId] = useState("");
  const [purpose, setPurpose] = useState("VACCINATION_PROOF");
  useEffect(() => {
    Promise.all(booking.pets.map((p) => healthAdvancedService.listDocuments(p.petId).then((list) => list.map((d) => ({ ...d, petName: p.petName })))))
      .then((lists) => setDocs(lists.flat().filter((d) => !d.voidedAt)))
      .catch(() => setDocs([]));
  }, [booking.pets]);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-text-secondary">{fa ? "فقط مدرکی که انتخاب می‌کنید، تا یک روز پس از خروج، برای این اقامتگاه قابل مشاهده است. هر زمان می‌توانید دسترسی را لغو کنید. بقیهٔ پروندهٔ سلامت دیده نمی‌شود." : "Only the document you choose is visible to this property, until one day after check-out. You can revoke access any time. The rest of the health record stays private."}</p>
      {docs === null ? <Skeleton className="h-11" /> : docs.length === 0 ? <p>{fa ? "مدرکی در پروندهٔ سلامت این حیوانات نیست." : "No documents in these pets' health records."}</p> : (
        <label className="flex flex-col gap-1"><span>{fa ? "مدرک" : "Document"}</span>
          <select value={docId} onChange={(e) => setDocId(e.target.value)} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
            <option value="">{fa ? "انتخاب کنید" : "Choose"}</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{`${d.petName} · ${d.title}`}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1"><span>{fa ? "برای" : "Purpose"}</span>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
          <option value="VACCINATION_PROOF">{fa ? "مدرک واکسن" : "Vaccination proof"}</option>
          <option value="HEALTH_CERTIFICATE">{fa ? "گواهی سلامت" : "Health certificate"}</option>
          <option value="OTHER_REQUIRED_BY_PROPERTY">{fa ? "سایر (درخواست اقامتگاه)" : "Other (requested by the property)"}</option>
        </select>
      </label>
      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}
      <Button disabled={!docId} isLoading={busy} onClick={() => onSubmit({ medicalDocumentId: docId, purpose })}>{fa ? "اشتراک" : "Share"}</Button>
    </div>
  );
}

function TripForm({ booking, busy, error, onSubmit }: { booking: TravelBookingDto; busy: boolean; error: string | null; onSubmit: (tripId: string) => void }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [trips, setTrips] = useState<TripListItemDto[] | null>(null);
  const [tripId, setTripId] = useState("");
  useEffect(() => {
    travelMarketService.trips("upcoming").then((t) => setTrips(t.filter((x) => booking.pets.some((p) => p.petId === x.petId)))).catch(() => setTrips([]));
  }, [booking.pets]);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {trips === null ? <Skeleton className="h-11" /> : trips.length === 0 ? (
        <p>{fa ? "سفر پیش‌رویی برای این حیوانات ندارید. از پروفایل حیوان یک سفر بسازید." : "You have no upcoming trip for these pets. Create one from the pet's profile."}</p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{fa ? "سفر" : "Trip"}</legend>
          {trips.map((t) => <label key={t.id} className="flex min-h-11 items-center gap-3"><input type="radio" name="t" className="h-5 w-5" checked={tripId === t.id} onChange={() => setTripId(t.id)} />{`${t.petName} · ${t.destinationCity ?? t.destinationCountry} · ${formatDay(t.departAt.slice(0, 10), lang)}`}</label>)}
        </fieldset>
      )}
      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}
      <Button disabled={!tripId} isLoading={busy} onClick={() => onSubmit(tripId)}>{fa ? "افزودن" : "Add"}</Button>
    </div>
  );
}
