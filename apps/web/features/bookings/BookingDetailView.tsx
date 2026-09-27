"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { AvailabilitySlotDto, BookingDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatAppointmentDateTime, formatDateTimeRange } from "@/lib/date/appointment-date";
import { bookingsService } from "@/services/bookings.service";
import { servicesService } from "@/services/services.service";
import { petsService } from "@/services/pets.service";
import { bookingStatusLabel, bookingStatusTone, paymentModeLabel, TIMELINE_ACTOR } from "@/features/discovery/labels";
import { errorMessage } from "@/features/booking-flow/BookingFlowView";

const CANCELLABLE = new Set(["PENDING_CONFIRMATION", "REQUESTED", "AWAITING_PAYMENT", "CONFIRMED"]);
const RECURRING_CATEGORIES = new Set(["WALKING", "TRAINING", "GROOMING"]);
const PAYMENT_STATUS: Record<string, [string, string]> = {
  NOT_REQUIRED: ["پرداخت آنلاین ندارد", "No online payment"],
  PENDING: ["در انتظار پرداخت", "Payment pending"],
  AUTHORIZED: ["مجاز شده", "Authorized"],
  PAID: ["پرداخت شد", "Paid"],
  FAILED: ["پرداخت ناموفق", "Payment failed"],
  REFUND_PENDING: ["بازگشت وجه در حال بررسی", "Refund in review"],
  REFUNDED: ["بازگشت داده شد", "Refunded"],
};

/**
 * Consumer booking detail — the canonical TRANSACTION detail: identity (number, status), the
 * frozen terms (price, deposit, policy, preparation), timeline, shared data, and only the actions
 * the current state actually allows. Every action calls a real endpoint; refunds show the amount
 * the snapshotted policy yields and are then processed by finance, never promised as instant.
 */
export function BookingDetailView({ bookingId }: { bookingId: string }) {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const searchParams = useSearchParams();
  const created = searchParams.get("created") === "1" || searchParams.get("confirmed") === "1";

  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [petNames, setPetNames] = useState<string>("");
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "notFound" | "error">("loading");
  const [dialog, setDialog] = useState<"cancel" | "cancelFollowing" | "reschedule" | "review" | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlotDto[] | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<string | null>(null);
  const [payKey, setPayKey] = useState(() => crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      const data = await bookingsService.getById(bookingId);
      setBooking(data);
      setState("ready");
      const names = await Promise.all([data.petId, ...data.additionalPetIds].map((id) => petsService.getById(id).then((p) => p.name).catch(() => "")));
      setPetNames(names.filter(Boolean).join("، "));
    } catch (e) {
      setState(e instanceof ApiError ? (e.status === 403 ? "forbidden" : e.status === 404 ? "notFound" : "error") : "error");
    }
  }, [bookingId]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (dialog !== "reschedule" || !booking || !rescheduleDate) return;
    setRescheduleSlots(null);
    setRescheduleSlot(null);
    const from = new Date(`${rescheduleDate}T00:00:00Z`);
    void servicesService
      .getAvailability(booking.providerServiceId, { locationId: booking.providerLocationId, from: (from < new Date() ? new Date() : from).toISOString(), to: new Date(from.getTime() + 86400_000).toISOString(), variantId: booking.variantId ?? undefined, providerUserId: booking.providerUserId ?? undefined })
      .then((res) => setRescheduleSlots(res.slots.filter((s) => s.state === "AVAILABLE")))
      .catch(() => setRescheduleSlots([]));
  }, [dialog, booking, rescheduleDate]);

  const refundPreview = useMemo(() => {
    if (!booking || booking.paymentStatus !== "PAID") return null;
    const paid = booking.paymentMode === "DEPOSIT" ? booking.depositAmount ?? 0 : (booking.priceAmount ?? 0) - booking.discountAmount;
    const hours = booking.freeCancellationHours ?? 24;
    const free = new Date(booking.startAt).getTime() - Date.now() >= hours * 3600_000;
    const percent = free ? 100 : booking.lateCancellationRefundPercent ?? 0;
    return { amount: Math.floor((paid * percent) / 100), percent, free };
  }, [booking]);

  async function act(run: () => Promise<unknown>, success: string) {
    setBusy(true);
    setActionError(null);
    try {
      await run();
      setDialog(null);
      setNotice(success);
      await load();
    } catch (e) {
      setActionError(errorMessage(e, fa));
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <Skeleton className="h-96 w-full" aria-label={fa ? "در حال بارگیری" : "Loading"} />;
  if (state === "forbidden") return <EmptyState title={fa ? "به این نوبت دسترسی ندارید" : "You do not have access to this booking"} />;
  if (state === "notFound") return <EmptyState title={fa ? "نوبت پیدا نشد" : "Booking not found"} />;
  if (state === "error" || !booking) return <ErrorRecovery title={fa ? "نوبت بارگیری نشد" : "Booking could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;

  const s = booking.bookingStatus;
  const upcoming = new Date(booking.startAt).getTime() > Date.now();
  const payAmount = booking.paymentMode === "DEPOSIT" ? booking.depositAmount : booking.priceAmount;
  const rebookHref = `/${locale}/providers/${booking.providerOrganizationId}/book?serviceId=${booking.providerServiceId}${booking.variantId ? `&variantId=${booking.variantId}` : ""}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {created ? (
        <ContextSurface className="border-brand-mint">
          <p role="status" className="font-bold">{s === "REQUESTED" ? (fa ? "درخواست شما ارسال شد" : "Your request was sent") : s === "AWAITING_PAYMENT" ? (fa ? "نوبت ثبت شد؛ برای قطعی شدن پرداخت کنید" : "Booked — pay to confirm") : fa ? "نوبت شما قطعی شد" : "Your booking is confirmed"}</p>
        </ContextSurface>
      ) : null}
      {notice ? <p role="status" className="text-brand-natural">{notice}</p> : null}

      <header className="flex flex-col gap-2 border-b border-border-subtle pb-4">
        <Link href={`/${locale}/bookings`} className="text-sm text-brand-natural">← {fa ? "نوبت‌های من" : "My bookings"}</Link>
        <h1 className="text-page-title text-text-primary">{booking.serviceName ?? booking.service?.name}{booking.variantName ? ` — ${booking.variantName}` : ""}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={bookingStatusTone(s)}>{bookingStatusLabel(s, fa)}</StatusLabel>
          <StatusLabel tone="neutral">{PAYMENT_STATUS[booking.paymentStatus]?.[fa ? 0 : 1] ?? booking.paymentStatus}</StatusLabel>
          {booking.bookingNumber ? <span className="text-sm text-text-secondary" dir="ltr">{booking.bookingNumber}</span> : null}
        </div>
      </header>

      {s === "REQUESTED" && booking.requestExpiresAt ? <p className="text-sm">{fa ? `ارائه‌دهنده تا ${formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone)} فرصت پاسخ دارد. تا آن زمان این نوبت قطعی نیست.` : `The provider has until ${formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone)} to respond. It is not confirmed yet.`}</p> : null}
      {s === "REJECTED" ? <p className="text-sm">{fa ? "ارائه‌دهنده این درخواست را نپذیرفت" : "The provider declined this request"}{booking.rejectedReason ? `: ${booking.rejectedReason}` : "."}</p> : null}
      {s === "EXPIRED" ? <p className="text-sm">{fa ? "این نوبت چون در مهلت تأیید یا پرداخت نشد آزاد شد." : "This booking was released because it was not accepted or paid in time."}</p> : null}
      {s === "RESCHEDULED" && booking.rescheduledToBookingId ? <Link className="text-sm text-brand-natural" href={`/${locale}/bookings/${booking.rescheduledToBookingId}`}>{fa ? "این نوبت به زمان جدید منتقل شده است ← مشاهده نوبت جدید" : "This booking moved to a new time → view it"}</Link> : null}

      {s === "AWAITING_PAYMENT" ? (
        <ContextSurface className="flex flex-col gap-3">
          <p className="font-bold">{paymentModeLabel(booking.paymentMode, fa)}: {payAmount !== null ? formatCurrency(payAmount, locale) : ""}</p>
          {booking.requestExpiresAt ? <p className="text-sm text-text-secondary">{fa ? `مهلت پرداخت: ${formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone)}` : `Pay by ${formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone)}`}</p> : null}
          {booking.paymentStatus === "FAILED" ? <p role="alert" className="text-state-urgent">{fa ? "پرداخت قبلی ناموفق بود. می‌توانید دوباره تلاش کنید." : "The last payment failed. You can try again."}</p> : null}
          <Button isLoading={busy} onClick={() => void act(async () => { await bookingsService.pay(booking.id, payKey); setPayKey(crypto.randomUUID()); }, fa ? "نتیجه پرداخت ثبت شد." : "Payment result recorded.")}>{fa ? "پرداخت امن" : "Pay securely"}</Button>
          <p className="text-xs text-text-secondary">{fa ? "نوبت فقط پس از تأیید درگاه پرداخت قطعی می‌شود." : "The booking is confirmed only after the gateway confirms payment."}</p>
        </ContextSurface>
      ) : null}

      <ContextSurface>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label={fa ? "حیوان" : "Pet"} value={petNames} />
          <Row label={fa ? "ارائه‌دهنده" : "Provider"} value={booking.provider?.name ?? ""} />
          <Row label={fa ? "زمان" : "When"} value={formatDateTimeRange(booking.startAt, booking.endAt, locale, booking.timezone)} />
          <Row label={fa ? "مکان" : "Location"} value={booking.customerAddress ? `${booking.customerAddress.addressLine}، ${booking.customerAddress.city}` : booking.location ? `${booking.location.addressLine}، ${booking.location.city}` : ""} />
          {booking.dropoffAddress ? <Row label={fa ? "مقصد" : "Drop-off"} value={`${booking.dropoffAddress.addressLine}، ${booking.dropoffAddress.city}`} /> : null}
          <Row label={fa ? "مبلغ" : "Price"} value={booking.priceAmount !== null ? formatCurrency(booking.priceAmount - booking.discountAmount, locale) : fa ? "پس از استعلام" : "On request"} />
          {booking.discountAmount ? <Row label={fa ? "تخفیف" : "Discount"} value={formatCurrency(booking.discountAmount, locale)} /> : null}
          <Row label={fa ? "پرداخت" : "Payment"} value={`${paymentModeLabel(booking.paymentMode, fa)}${booking.depositAmount ? ` — ${fa ? "پیش‌پرداخت" : "deposit"} ${formatCurrency(booking.depositAmount, locale)}` : ""}`} />
          <Row label={fa ? "قوانین لغو (ثبت‌شده هنگام رزرو)" : "Cancellation terms (as booked)"} value={booking.cancellationPolicy ?? (fa ? `لغو رایگان تا ${(booking.freeCancellationHours ?? 24).toLocaleString(locale)} ساعت قبل؛ سپس ${(booking.lateCancellationRefundPercent ?? 0).toLocaleString(locale)}٪ بازگشت وجه` : `Free until ${booking.freeCancellationHours ?? 24}h before; then ${booking.lateCancellationRefundPercent ?? 0}% refund`)} />
          {booking.preparation ? <Row label={fa ? "آمادگی قبل از مراجعه" : "Before you come"} value={booking.preparation} /> : null}
          {booking.reasonForVisit ? <Row label={fa ? "توضیح شما" : "Your notes"} value={booking.reasonForVisit} /> : null}
          {booking.completionNote ? <Row label={fa ? "گزارش ارائه‌دهنده" : "Provider summary"} value={booking.completionNote} /> : null}
          {booking.cancelledReason ? <Row label={fa ? "علت لغو" : "Cancellation reason"} value={booking.cancelledReason} /> : null}
        </dl>
      </ContextSurface>

      {booking.petAccess ? (
        <ContextSurface className="flex flex-col gap-1 text-sm">
          <h2 className="font-bold">{booking.category === "VET" ? (fa ? "اطلاعات سلامت مشترک" : "Shared health information") : fa ? "دسترسی مراقبتی" : "Care access"}</h2>
          <p>{booking.petAccess.scopePreset === "HEALTH_BASICS" ? (fa ? "خلاصه سلامت" : "Health summary") : booking.petAccess.scopePreset === "MINIMAL_VET_CONTEXT" ? (fa ? "فقط مشخصات پایه" : "Basic identity only") : fa ? "اطلاعات مراقبت روزمره" : "Everyday care profile"}{booking.petAccess.expiresAt ? ` · ${fa ? "تا" : "until"} ${formatAppointmentDateTime(booking.petAccess.expiresAt, locale, booking.timezone)}` : ""}</p>
        </ContextSurface>
      ) : null}

      <section aria-labelledby="timeline-title" className="flex flex-col gap-2">
        <h2 id="timeline-title" className="font-bold">{fa ? "روند نوبت" : "Timeline"}</h2>
        <ol className="flex flex-col gap-2 border-s-2 border-border-subtle ps-4 text-sm">
          {booking.timeline.map((e) => (
            <li key={e.id}>
              <span className="font-bold">{bookingStatusLabel(e.toStatus, fa)}</span> · {TIMELINE_ACTOR[e.actorType]?.[fa ? 0 : 1]} · <time dateTime={e.createdAt}>{formatAppointmentDateTime(e.createdAt, locale, booking.timezone)}</time>
            </li>
          ))}
        </ol>
      </section>

      {actionError && !dialog ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}

      <div className="flex flex-wrap gap-2">
        {s === "CONFIRMED" && upcoming && !["SITTING", "BOARDING"].includes(booking.category) ? <Button variant="secondary" onClick={() => { setRescheduleDate(booking.startAt.slice(0, 10)); setDialog("reschedule"); }}>{fa ? "تغییر زمان" : "Reschedule"}</Button> : null}
        {CANCELLABLE.has(s) ? <Button variant="secondary" onClick={() => setDialog("cancel")}>{fa ? "لغو نوبت" : "Cancel booking"}</Button> : null}
        {booking.bookingSeriesId && CANCELLABLE.has(s) ? <Button variant="ghost" onClick={() => setDialog("cancelFollowing")}>{fa ? "لغو این و نوبت‌های بعدی" : "Cancel this and following"}</Button> : null}
        {s === "CONFIRMED" && RECURRING_CATEGORIES.has(booking.category) && !booking.bookingSeriesId && booking.paymentMode !== "FULL_PREPAYMENT" && booking.paymentMode !== "DEPOSIT" ? (
          <Button variant="ghost" isLoading={busy} onClick={() => void act(() => bookingsService.recur(booking.id, 4, 1), fa ? "نوبت‌های هفتگی ساخته شد؛ روزهای پر رد شدند." : "Weekly bookings created; unavailable weeks were skipped.")}>{fa ? "تکرار هفتگی (۴ نوبت)" : "Repeat weekly (4 visits)"}</Button>
        ) : null}
        {s === "COMPLETED" && !booking.review ? <Button onClick={() => setDialog("review")}>{fa ? "ثبت نظر" : "Leave a review"}</Button> : null}
        {["COMPLETED", "CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER", "EXPIRED", "REJECTED", "NO_SHOW"].includes(s) ? <Link href={rebookHref} className="rounded-md border border-brand-natural px-4 py-2 text-sm font-bold text-brand-natural">{fa ? "رزرو دوباره" : "Book again"}</Link> : null}
        <Link href={`/${locale}/support/new?relatedEntityType=BOOKING&relatedEntityId=${booking.id}&category=BOOKING`} className="px-4 py-2 text-sm text-text-secondary underline">{fa ? "گزارش مشکل به پشتیبانی" : "Get support"}</Link>
      </div>

      <Dialog open={dialog === "cancel" || dialog === "cancelFollowing"} onClose={() => setDialog(null)} title={dialog === "cancelFollowing" ? (fa ? "لغو این و نوبت‌های بعدی" : "Cancel this and following") : fa ? "لغو نوبت" : "Cancel booking"}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">{fa ? "زمان آزاد می‌شود و دسترسی ارائه‌دهنده به اطلاعات حیوان پایان می‌یابد." : "The time is released and the provider's access to your pet's information ends."}</p>
          {refundPreview ? <p className="text-sm font-bold">{refundPreview.free ? (fa ? `بازگشت کامل: ${formatCurrency(refundPreview.amount, locale)}` : `Full refund: ${formatCurrency(refundPreview.amount, locale)}`) : fa ? `طبق قوانین، ${refundPreview.percent.toLocaleString(locale)}٪ یعنی ${formatCurrency(refundPreview.amount, locale)} بازگردانده می‌شود.` : `Per the terms, ${refundPreview.percent}% (${formatCurrency(refundPreview.amount, locale)}) is refunded.`} {fa ? "بازگشت وجه پس از بررسی مالی انجام می‌شود." : "Refunds are processed after finance review."}</p> : null}
          <label className="flex flex-col gap-1 text-sm">{fa ? "علت (اختیاری)" : "Reason (optional)"}<input className="rounded border border-border-subtle bg-surface-base p-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>{fa ? "منصرف شدم" : "Keep booking"}</Button>
            <Button className="flex-1" isLoading={busy} onClick={() => void act(() => (dialog === "cancelFollowing" ? bookingsService.cancelFollowing(booking.id, reason || undefined) : bookingsService.cancel(booking.id, reason || undefined)), fa ? "نوبت لغو شد." : "Booking cancelled.")}>{fa ? "بله، لغو شود" : "Yes, cancel"}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "reschedule"} onClose={() => setDialog(null)} title={fa ? "انتخاب زمان جدید" : "Choose a new time"}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">{fa ? "نوبت فعلی تا وقتی زمان جدید قطعی نشده، حفظ می‌شود. مبلغ و قوانین تغییر نمی‌کند." : "Your current booking is kept until the new time is secured. Price and terms stay the same."}</p>
          <input type="date" aria-label={fa ? "روز" : "Day"} className="rounded border border-border-subtle bg-surface-base p-2" min={new Date().toISOString().slice(0, 10)} value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
          {rescheduleSlots === null ? <Skeleton className="h-16 w-full" /> : rescheduleSlots.length === 0 ? <p className="text-sm">{fa ? "در این روز زمان آزادی نیست." : "No open times on this day."}</p> : (
            <div className="grid grid-cols-3 gap-2">
              {rescheduleSlots.map((slot) => (
                <button key={slot.startAt} type="button" aria-pressed={rescheduleSlot === slot.startAt} onClick={() => setRescheduleSlot(slot.startAt)} className={`rounded border px-2 py-2 text-sm ${rescheduleSlot === slot.startAt ? "border-brand-natural bg-brand-natural text-white" : "border-border-subtle"}`}>
                  {new Intl.DateTimeFormat(fa ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: slot.timezone }).format(new Date(slot.startAt))}
                </button>
              ))}
            </div>
          )}
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button disabled={!rescheduleSlot} isLoading={busy} onClick={() => void act(async () => { const moved = await bookingsService.reschedule(booking.id, rescheduleSlot!, crypto.randomUUID()); window.location.assign(`/${locale}/bookings/${moved.id}`); }, fa ? "زمان نوبت تغییر کرد." : "Booking rescheduled.")}>{fa ? "تأیید زمان جدید" : "Confirm new time"}</Button>
        </div>
      </Dialog>

      <Dialog open={dialog === "review"} onClose={() => setDialog(null)} title={fa ? "نظر شما درباره این نوبت" : "Review this booking"}>
        <div className="flex flex-col gap-3">
          <fieldset className="flex gap-2">
            <legend className="mb-1 text-sm">{fa ? "امتیاز" : "Rating"}</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name="rating" checked={rating === n} onChange={() => setRating(n)} />{n.toLocaleString(locale)}★</label>
            ))}
          </fieldset>
          <textarea aria-label={fa ? "متن نظر" : "Review text"} className="min-h-24 rounded border border-border-subtle bg-surface-base p-2" maxLength={2000} value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder={fa ? "تجربه‌تان را بنویسید؛ اطلاعات شخصی یا پزشکی ننویسید." : "Describe your experience; avoid personal or medical details."} />
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button isLoading={busy} onClick={() => void act(() => bookingsService.review(booking.id, rating, reviewText.trim() || undefined), fa ? "نظر شما منتشر شد." : "Your review was published.")}>{fa ? "انتشار نظر" : "Publish review"}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-secondary">{label}</dt>
      <dd className="mt-1 text-text-primary">{value}</dd>
    </div>
  );
}
