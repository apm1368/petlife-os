"use client";

import Link from "next/link";
import { randomId } from "@/lib/id/random-id";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { DateField } from "@/features/shared/date-picker/DateField";
import { BackLink } from "@/features/shared/BackLink";
import { BookingFrame } from "./BookingFrame";
import type { RouteLocale } from "@/lib/i18n/config";

const CANCELLABLE = new Set(["PENDING_CONFIRMATION", "REQUESTED", "AWAITING_PAYMENT", "CONFIRMED"]);
const RECURRING_CATEGORIES = new Set(["WALKING", "TRAINING", "GROOMING"]);
/**
 * Consumer booking detail — the canonical TRANSACTION detail: identity (number, status), the
 * frozen terms (price, deposit, policy, preparation), timeline, shared data, and only the actions
 * the current state actually allows. Every action calls a real endpoint; refunds show the amount
 * the snapshotted policy yields and are then processed by finance, never promised as instant.
 */
export function BookingDetailView({ bookingId }: { bookingId: string }) {
  const locale = useLocale() as RouteLocale;
  const fa = locale === "fa";
  const t = useTranslations("bookingDetail");
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
  const [payKey, setPayKey] = useState(() => randomId());

  const load = useCallback(async () => {
    try {
      const data = await bookingsService.getById(bookingId);
      setBooking(data);
      setState("ready");
      const names = await Promise.all([data.petId, ...data.additionalPetIds].map((id) => petsService.getById(id).then((p) => p.name).catch(() => "")));
      setPetNames(names.filter(Boolean).join(fa ? "، " : ", "));
    } catch (e) {
      setState(e instanceof ApiError ? (e.status === 403 ? "forbidden" : e.status === 404 ? "notFound" : "error") : "error");
    }
  }, [bookingId, fa]);
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

  if (state === "loading") return <Skeleton className="h-96 w-full" aria-label={fa ? "در حال بارگیری" : t("ui.loading")} />;
  if (state === "forbidden") return <EmptyState title={fa ? "به این نوبت دسترسی ندارید" : t("ui.forbidden")} />;
  if (state === "notFound") return <EmptyState title={fa ? "نوبت پیدا نشد" : t("ui.notFound")} />;
  if (state === "error" || !booking) return <ErrorRecovery title={fa ? "نوبت بارگیری نشد" : t("ui.loadFailed")} message="" retryLabel={fa ? "تلاش دوباره" : t("ui.retry")} onRetry={load} />;

  const s = booking.bookingStatus;
  const upcoming = new Date(booking.startAt).getTime() > Date.now();
  const payAmount = booking.paymentMode === "DEPOSIT" ? booking.depositAmount : booking.priceAmount;
  const rebookHref = `/${locale}/providers/${booking.providerOrganizationId}/book?serviceId=${booking.providerServiceId}${booking.variantId ? `&variantId=${booking.variantId}` : ""}`;

  return (
    <BookingFrame>
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {created ? (
        <ContextSurface className="border-brand-mint">
          <p role="status" className="font-bold">{s === "REQUESTED" ? (fa ? "درخواست شما ارسال شد" : t("ui.created.requested")) : s === "AWAITING_PAYMENT" ? (fa ? "نوبت ثبت شد؛ برای قطعی شدن پرداخت کنید" : t("ui.created.awaitingPayment")) : fa ? "نوبت شما قطعی شد" : t("ui.created.confirmed")}</p>
        </ContextSurface>
      ) : null}
      {notice ? <p role="status" className="text-brand-natural">{notice}</p> : null}

      <header className="flex flex-col gap-2 border-b border-border-subtle pb-4">
        <BackLink href={`/${locale}/bookings`} label={fa ? "نوبت‌های من" : t("ui.myBookings")} />
        <h1 className="text-page-title text-text-primary">{booking.serviceName ?? booking.service?.name}{booking.variantName ? ` — ${booking.variantName}` : ""}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={bookingStatusTone(s)}>{bookingStatusLabel(s, locale)}</StatusLabel>
          <StatusLabel tone="neutral">{t(`paymentStatus.${booking.paymentStatus}`)}</StatusLabel>
          {booking.bookingNumber ? <span className="text-sm text-text-secondary" dir="ltr">{booking.bookingNumber}</span> : null}
        </div>
      </header>

      {s === "REQUESTED" && booking.requestExpiresAt ? <p className="text-sm">{fa ? `ارائه‌دهنده تا ${formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone)} فرصت پاسخ دارد. تا آن زمان این نوبت قطعی نیست.` : t("ui.requestedUntil", { date: formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone) })}</p> : null}
      {s === "REJECTED" ? <p className="text-sm">{fa ? "ارائه‌دهنده این درخواست را نپذیرفت" : t("ui.declined")}{booking.rejectedReason ? `: ${booking.rejectedReason}` : "."}</p> : null}
      {s === "EXPIRED" ? <p className="text-sm">{fa ? "این نوبت چون در مهلت تأیید یا پرداخت نشد آزاد شد." : t("ui.expired")}</p> : null}
      {s === "RESCHEDULED" && booking.rescheduledToBookingId ? <Link className="text-sm text-brand-natural" href={`/${locale}/bookings/${booking.rescheduledToBookingId}`}>{fa ? "این نوبت به زمان جدید منتقل شده است ← مشاهده نوبت جدید" : t("ui.rescheduledLink")}</Link> : null}

      {s === "AWAITING_PAYMENT" ? (
        <ContextSurface className="flex flex-col gap-3">
          <p className="font-bold">{paymentModeLabel(booking.paymentMode, locale)}: {payAmount !== null ? formatCurrency(payAmount, locale) : ""}</p>
          {booking.requestExpiresAt ? <p className="text-sm text-text-secondary">{fa ? `مهلت پرداخت: ${formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone)}` : t("ui.payBy", { date: formatAppointmentDateTime(booking.requestExpiresAt, locale, booking.timezone) })}</p> : null}
          {booking.paymentStatus === "FAILED" ? <p role="alert" className="text-state-urgent">{fa ? "پرداخت قبلی ناموفق بود. می‌توانید دوباره تلاش کنید." : t("ui.paymentFailed")}</p> : null}
          <Button isLoading={busy} onClick={() => void act(async () => { await bookingsService.pay(booking.id, payKey); setPayKey(randomId()); }, fa ? "نتیجه پرداخت ثبت شد." : t("ui.paymentRecorded"))}>{fa ? "پرداخت امن" : t("ui.paySecurely")}</Button>
          <p className="text-xs text-text-secondary">{fa ? "نوبت فقط پس از تأیید درگاه پرداخت قطعی می‌شود." : t("ui.gatewayConfirmation")}</p>
        </ContextSurface>
      ) : null}

      <ContextSurface>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label={fa ? "حیوان" : t("pet")} value={petNames} />
          <Row label={fa ? "ارائه‌دهنده" : t("provider")} value={booking.provider?.name ?? ""} />
          <Row label={fa ? "زمان" : t("dateTime")} value={formatDateTimeRange(booking.startAt, booking.endAt, locale, booking.timezone)} />
          <Row label={fa ? "مکان" : t("location")} value={booking.customerAddress ? `${booking.customerAddress.addressLine}${fa ? "، " : ", "}${booking.customerAddress.city}` : booking.location ? `${booking.location.addressLine}${fa ? "، " : ", "}${booking.location.city}` : ""} />
          {booking.dropoffAddress ? <Row label={fa ? "مقصد" : t("dropoffLocation")} value={`${booking.dropoffAddress.addressLine}${fa ? "، " : ", "}${booking.dropoffAddress.city}`} /> : null}
          <Row label={fa ? "مبلغ" : t("ui.price")} value={booking.priceAmount !== null ? formatCurrency(booking.priceAmount - booking.discountAmount, locale) : fa ? "پس از استعلام" : t("ui.onRequest")} />
          {booking.discountAmount ? <Row label={fa ? "تخفیف" : t("ui.discount")} value={formatCurrency(booking.discountAmount, locale)} /> : null}
          <Row label={fa ? "پرداخت" : t("ui.payment")} value={`${paymentModeLabel(booking.paymentMode, locale)}${booking.depositAmount ? ` — ${fa ? "پیش‌پرداخت" : t("ui.deposit")} ${formatCurrency(booking.depositAmount, locale)}` : ""}`} />
          <Row label={fa ? "قوانین لغو (ثبت‌شده هنگام رزرو)" : t("ui.cancellationTerms")} value={booking.cancellationPolicy ?? (fa ? `لغو رایگان تا ${(booking.freeCancellationHours ?? 24).toLocaleString(locale)} ساعت قبل؛ سپس ${(booking.lateCancellationRefundPercent ?? 0).toLocaleString(locale)}٪ بازگشت وجه` : t("ui.refundTerms", { hours: (booking.freeCancellationHours ?? 24).toLocaleString(locale), percent: (booking.lateCancellationRefundPercent ?? 0).toLocaleString(locale) }))} />
          {booking.preparation ? <Row label={fa ? "آمادگی قبل از مراجعه" : t("ui.preparation")} value={booking.preparation} /> : null}
          {booking.reasonForVisit ? <Row label={fa ? "توضیح شما" : t("reason")} value={booking.reasonForVisit} /> : null}
          {booking.completionNote ? <Row label={fa ? "گزارش ارائه‌دهنده" : t("completionNote")} value={booking.completionNote} /> : null}
          {booking.cancelledReason ? <Row label={fa ? "علت لغو" : t("cancelledReason")} value={booking.cancelledReason} /> : null}
        </dl>
      </ContextSurface>

      {booking.petAccess ? (
        <ContextSurface className="flex flex-col gap-1 text-sm">
          <h2 className="font-bold">{booking.category === "VET" ? (fa ? "اطلاعات سلامت مشترک" : t("ui.sharedHealth")) : fa ? "دسترسی مراقبتی" : t("careAccess.title")}</h2>
          <p>{booking.petAccess.scopePreset === "HEALTH_BASICS" ? (fa ? "خلاصه سلامت" : t("ui.healthSummary")) : booking.petAccess.scopePreset === "MINIMAL_VET_CONTEXT" ? (fa ? "فقط مشخصات پایه" : t("careAccess.preset.MINIMAL_VET_CONTEXT")) : fa ? "اطلاعات مراقبت روزمره" : t("ui.everydayCareProfile")}{booking.petAccess.expiresAt ? ` · ${fa ? "تا" : t("ui.until")} ${formatAppointmentDateTime(booking.petAccess.expiresAt, locale, booking.timezone)}` : ""}</p>
        </ContextSurface>
      ) : null}

      <section aria-labelledby="timeline-title" className="flex flex-col gap-2">
        <h2 id="timeline-title" className="font-bold">{fa ? "روند نوبت" : t("ui.timeline")}</h2>
        <ol className="flex flex-col gap-2 border-s-2 border-border-subtle ps-4 text-sm">
          {booking.timeline.map((e) => (
            <li key={e.id}>
              <span className="font-bold">{bookingStatusLabel(e.toStatus, locale)}</span> · {fa ? TIMELINE_ACTOR[e.actorType]?.[0] : t(`ui.actor.${e.actorType}`)} · <time dateTime={e.createdAt}>{formatAppointmentDateTime(e.createdAt, locale, booking.timezone)}</time>
            </li>
          ))}
        </ol>
      </section>

      {actionError && !dialog ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}

      <div className="flex flex-wrap gap-2">
        {s === "CONFIRMED" && upcoming && !["SITTING", "BOARDING"].includes(booking.category) ? <Button variant="secondary" onClick={() => { setRescheduleDate(booking.startAt.slice(0, 10)); setDialog("reschedule"); }}>{fa ? "تغییر زمان" : t("ui.reschedule")}</Button> : null}
        {CANCELLABLE.has(s) ? <Button variant="secondary" onClick={() => setDialog("cancel")}>{fa ? "لغو نوبت" : t("cancel")}</Button> : null}
        {booking.bookingSeriesId && CANCELLABLE.has(s) ? <Button variant="ghost" onClick={() => setDialog("cancelFollowing")}>{fa ? "لغو این و نوبت‌های بعدی" : t("ui.cancelFollowing")}</Button> : null}
        {s === "CONFIRMED" && RECURRING_CATEGORIES.has(booking.category) && !booking.bookingSeriesId && booking.paymentMode !== "FULL_PREPAYMENT" && booking.paymentMode !== "DEPOSIT" ? (
          <Button variant="ghost" isLoading={busy} onClick={() => void act(() => bookingsService.recur(booking.id, 4, 1), fa ? "نوبت‌های هفتگی ساخته شد؛ روزهای پر رد شدند." : t("ui.weeklyCreated"))}>{fa ? "تکرار هفتگی (۴ نوبت)" : t("ui.repeatWeekly")}</Button>
        ) : null}
        {s === "COMPLETED" && !booking.review ? <Button onClick={() => setDialog("review")}>{fa ? "ثبت نظر" : t("ui.leaveReview")}</Button> : null}
        {["COMPLETED", "CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER", "EXPIRED", "REJECTED", "NO_SHOW"].includes(s) ? <Link href={rebookHref} className="rounded-md border border-brand-natural px-4 py-2 text-sm font-bold text-brand-natural">{fa ? "رزرو دوباره" : t("ui.bookAgain")}</Link> : null}
        <Link href={`/${locale}/support/new?relatedEntityType=BOOKING&relatedEntityId=${booking.id}&category=BOOKING`} className="px-4 py-2 text-sm text-text-secondary underline">{fa ? "گزارش مشکل به پشتیبانی" : t("getSupport")}</Link>
      </div>

      <Dialog open={dialog === "cancel" || dialog === "cancelFollowing"} onClose={() => setDialog(null)} title={dialog === "cancelFollowing" ? (fa ? "لغو این و نوبت‌های بعدی" : t("ui.cancelFollowing")) : fa ? "لغو نوبت" : t("cancelDialog.title")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">{fa ? "زمان آزاد می‌شود و دسترسی ارائه‌دهنده به اطلاعات حیوان پایان می‌یابد." : t("cancelDialog.body")}</p>
          {refundPreview ? <p className="text-sm font-bold">{refundPreview.free ? (fa ? `بازگشت کامل: ${formatCurrency(refundPreview.amount, locale)}` : t("ui.fullRefund", { amount: formatCurrency(refundPreview.amount, locale) })) : fa ? `طبق قوانین، ${refundPreview.percent.toLocaleString(locale)}٪ یعنی ${formatCurrency(refundPreview.amount, locale)} بازگردانده می‌شود.` : t("ui.partialRefund", { percent: refundPreview.percent.toLocaleString(locale), amount: formatCurrency(refundPreview.amount, locale) })} {fa ? "بازگشت وجه پس از بررسی مالی انجام می‌شود." : t("ui.refundReview")}</p> : null}
          <label className="flex flex-col gap-1 text-sm">{fa ? "علت (اختیاری)" : t("ui.reasonOptional")}<input className="rounded border border-border-subtle bg-surface-base p-2" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>{fa ? "منصرف شدم" : t("ui.keepBooking")}</Button>
            <Button className="flex-1" isLoading={busy} onClick={() => void act(() => (dialog === "cancelFollowing" ? bookingsService.cancelFollowing(booking.id, reason || undefined) : bookingsService.cancel(booking.id, reason || undefined)), fa ? "نوبت لغو شد." : t("ui.bookingCancelled"))}>{fa ? "بله، لغو شود" : t("cancelDialog.confirm")}</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "reschedule"} onClose={() => setDialog(null)} title={fa ? "انتخاب زمان جدید" : t("ui.chooseNewTime")}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">{fa ? "نوبت فعلی تا وقتی زمان جدید قطعی نشده، حفظ می‌شود. مبلغ و قوانین تغییر نمی‌کند." : t("ui.rescheduleHint")}</p>
          <DateField label={fa ? "روز جدید" : t("ui.newDay")} min={new Date().toISOString().slice(0, 10)} value={rescheduleDate} onChange={setRescheduleDate} />
          {rescheduleSlots === null ? <Skeleton className="h-16 w-full" /> : rescheduleSlots.length === 0 ? <p className="text-sm">{fa ? "در این روز زمان آزادی نیست." : t("ui.noOpenTimes")}</p> : (
            <div className="grid grid-cols-3 gap-2">
              {rescheduleSlots.map((slot) => (
                <button key={slot.startAt} type="button" aria-pressed={rescheduleSlot === slot.startAt} onClick={() => setRescheduleSlot(slot.startAt)} className={`rounded border px-2 py-2 text-sm ${rescheduleSlot === slot.startAt ? "border-brand-natural bg-brand-solid text-on-brand" : "border-border-subtle"}`}>
                  {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: slot.timezone }).format(new Date(slot.startAt))}
                </button>
              ))}
            </div>
          )}
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button disabled={!rescheduleSlot} isLoading={busy} onClick={() => void act(async () => { const moved = await bookingsService.reschedule(booking.id, rescheduleSlot!, randomId()); window.location.assign(`/${locale}/bookings/${moved.id}`); }, fa ? "زمان نوبت تغییر کرد." : t("ui.bookingRescheduled"))}>{fa ? "تأیید زمان جدید" : t("ui.confirmNewTime")}</Button>
        </div>
      </Dialog>

      <Dialog open={dialog === "review"} onClose={() => setDialog(null)} title={fa ? "نظر شما درباره این نوبت" : t("ui.reviewThisBooking")}>
        <div className="flex flex-col gap-3">
          <fieldset className="flex gap-2">
            <legend className="mb-1 text-sm">{fa ? "امتیاز" : t("ui.rating")}</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name="rating" checked={rating === n} onChange={() => setRating(n)} />{n.toLocaleString(locale)}★</label>
            ))}
          </fieldset>
          <textarea aria-label={fa ? "متن نظر" : t("ui.reviewText")} className="min-h-24 rounded border border-border-subtle bg-surface-base p-2" maxLength={2000} value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder={fa ? "تجربه‌تان را بنویسید؛ اطلاعات شخصی یا پزشکی ننویسید." : t("ui.reviewHint")} />
          {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
          <Button isLoading={busy} onClick={() => void act(() => bookingsService.review(booking.id, rating, reviewText.trim() || undefined), fa ? "نظر شما ثبت شد و پس از بررسی منتشر می‌شود." : t("ui.submitForReview"))}>{fa ? "ثبت برای بررسی" : t("ui.submitForReview")}</Button>
        </div>
      </Dialog>
    </div>
    </BookingFrame>
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
