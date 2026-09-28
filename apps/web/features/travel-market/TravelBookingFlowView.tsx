"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, ShieldCheck, Skeleton, StatusLabel, Timer } from "@petlife/ui";
import type { TravelBookingDto, TripListItemDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { randomId } from "@/lib/id/random-id";
import { formatDay } from "@/lib/date/jalali";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { bookingStatusLabel, bookingStatusTone, cancellationSummary, countdown, money, paymentTimingSummary, policyFacts, stayDates } from "./labels";

type Step = "pets" | "trip" | "review" | "pay" | "done";

/**
 * TRAVEL BOOKING PATTERN. Entered with a live hold. Every term shown here is the frozen snapshot
 * the booking will carry (rate plan, pet rules, nightly prices). The server decides the outcome:
 * request sent, payment due, or confirmed. Payment success is only what the gateway reports.
 */
export function TravelBookingFlowView({ bookingId }: { bookingId: string }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const router = useRouter();
  const [booking, setBooking] = useState<TravelBookingDto | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [step, setStep] = useState<Step>("pets");
  const [now, setNow] = useState(() => Date.now());
  const [ack, setAck] = useState(false);
  const [trips, setTrips] = useState<TripListItemDto[] | null>(null);
  const [tripId, setTripId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payKey, setPayKey] = useState(() => randomId());

  const fetchBooking = useCallback(async () => {
    try {
      const b = await travelMarketService.getBooking(bookingId);
      setBooking(b);
      setStep(b.status === "HELD" ? "pets" : b.status === "AWAITING_PAYMENT" ? "pay" : "done");
      setLoad("ready");
    } catch (e) {
      setLoad(e instanceof ApiError && e.status === 404 ? "notFound" : "error");
    }
  }, [bookingId]);
  useEffect(() => void fetchBooking(), [fetchBooking]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (step !== "trip" || trips) return;
    travelMarketService.trips("upcoming").then((t) => {
      setTrips(t);
      if (booking) {
        const petIds = new Set(booking.pets.map((p) => p.petId));
        const match = t.find((x) => petIds.has(x.petId) && (x.destinationCity ?? "").toLowerCase() === booking.listingCity.toLowerCase());
        if (match) setTripId(match.id);
      }
    }).catch(() => setTrips([]));
  }, [step, trips, booking]);

  if (load === "loading") return <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (load === "notFound") return <div className="mx-auto max-w-3xl px-4 py-10"><EmptyState title={fa ? "این رزرو پیدا نشد" : "Booking not found"} actionLabel={fa ? "سفرهای من" : "My trips"} onAction={() => router.push(`/${lang}/travel/trips`)} /></div>;
  if (load === "error" || !booking) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void fetchBooking()} /></div>;

  const holdLeft = booking.holdExpiresAt ? new Date(booking.holdExpiresAt).getTime() - now : 0;
  const payLeft = booking.requestExpiresAt ? new Date(booking.requestExpiresAt).getTime() - now : 0;
  const holdExpired = booking.status === "HELD" && holdLeft <= 0;
  const needsAck = booking.timeline[0]?.reason === "MORE_INFO_NEEDED";
  const plan = booking.ratePlan;
  const bd = booking.priceBreakdown;
  const listingHref = `/${lang}/travel/stays/${booking.listingId}?checkIn=${booking.checkIn.slice(0, 10)}&checkOut=${booking.checkOut.slice(0, 10)}`;
  const steps: { key: Step; fa: string; en: string }[] = [
    { key: "pets", fa: "حیوانات", en: "Pets" },
    { key: "trip", fa: "سفر", en: "Trip" },
    { key: "review", fa: "بازبینی", en: "Review" },
    { key: "pay", fa: "پرداخت", en: "Payment" },
  ];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await travelMarketService.submit(booking.id, { travelerNote: note.trim() || undefined, tripId: tripId || undefined, acknowledgeMissingInfo: needsAck ? ack : undefined });
      setBooking(b);
      setStep(b.status === "AWAITING_PAYMENT" ? "pay" : "done");
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(code === "TRAVEL_HOLD_EXPIRED" ? (fa ? "مهلت نگه‌داشتن تاریخ‌ها تمام شد. دوباره تاریخ را انتخاب کنید." : "Your hold expired. Please choose the dates again.") : fa ? "ثبت انجام نشد. دوباره تلاش کنید." : "This could not be submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await travelMarketService.pay(booking.id, payKey);
      setBooking(b);
      if (b.status === "CONFIRMED") setStep("done");
      else if (b.paymentStatus === "FAILED") {
        setError(fa ? "درگاه پرداخت را ناموفق اعلام کرد. مبلغی کسر نشده است؛ می‌توانید در مهلت باقی‌مانده دوباره تلاش کنید." : "The payment gateway reported a failure. Nothing was charged; you can retry within the remaining window.");
        setPayKey(randomId());
      } else setError(fa ? "نتیجهٔ پرداخت هنوز از درگاه نرسیده است. وضعیت رزرو به‌محض دریافت به‌روز می‌شود." : "The gateway has not reported the result yet. The booking updates as soon as it does.");
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(code === "TRAVEL_PAYMENT_WINDOW_EXPIRED" ? (fa ? "مهلت پرداخت این رزرو تمام شده است." : "The payment window for this booking has closed.") : fa ? "پرداخت انجام نشد. دوباره تلاش کنید." : "Payment could not be completed. Please try again.");
      setPayKey(randomId());
    } finally {
      setBusy(false);
    }
  };

  const Summary = (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-elevated p-4">
      <div className="flex gap-3">
        {booking.listingCoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={booking.listingCoverUrl} alt="" className="h-16 w-20 shrink-0 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="font-bold text-text-primary">{booking.listingTitle}</p>
          <p className="text-metadata text-text-secondary">{booking.unitName}{plan ? ` · ${plan.name}` : ""}</p>
          <p className="text-sm text-text-primary">{stayDates(booking, lang)}</p>
        </div>
      </div>
      <p className="text-metadata text-text-secondary">{fa ? "کد رزرو: " : "Reference: "}<span className="font-mono">{booking.reference}</span></p>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <h1 className="text-page-title text-text-primary">{step === "done" ? (fa ? "وضعیت رزرو" : "Booking status") : fa ? "تکمیل رزرو" : "Complete your booking"}</h1>
      {Summary}

      {booking.status === "HELD" ? (
        <div role="timer" aria-live="off" className={`flex items-center gap-2 rounded-md p-3 text-sm ${holdLeft < 180_000 ? "bg-state-attention/10 text-state-attention" : "bg-surface-subtle text-text-primary"}`}>
          <Timer aria-hidden className="h-5 w-5" />
          {holdExpired ? (fa ? "مهلت نگه‌داشتن تاریخ‌ها تمام شد." : "Your hold has expired.") : fa ? `این تاریخ‌ها تا ${countdown(holdLeft, lang)} دیگر برای شما نگه داشته شده‌اند.` : `These dates are held for you for ${countdown(holdLeft, lang)}.`}
        </div>
      ) : null}

      {holdExpired ? (
        <EmptyState title={fa ? "تاریخ‌ها آزاد شدند" : "The dates were released"} description={fa ? "برای ادامه دوباره تاریخ‌ها را انتخاب کنید؛ ممکن است قیمت یا موجودی تغییر کرده باشد." : "Choose the dates again to continue; price or availability may have changed."} actionLabel={fa ? "بازگشت به اقامتگاه" : "Back to the stay"} onAction={() => router.push(listingHref)} />
      ) : step !== "done" ? (
        <>
          <ol className="flex gap-2 overflow-x-auto text-metadata" aria-label={fa ? "مراحل" : "Steps"}>
            {steps.map((s, i) => {
              const current = s.key === step;
              const doneStep = steps.findIndex((x) => x.key === step) > i;
              return <li key={s.key} aria-current={current ? "step" : undefined} className={`shrink-0 rounded-full px-3 py-1 ${current ? "bg-brand-natural text-text-inverse" : doneStep ? "bg-surface-subtle text-text-primary" : "text-text-secondary"}`}>{doneStep ? "✓ " : ""}{fa ? s.fa : s.en}</li>;
            })}
          </ol>

          {step === "pets" ? (
            <section className="flex flex-col gap-4" aria-labelledby="s-pets">
              <h2 id="s-pets" className="text-section-title">{fa ? "حیوانات همراه و قوانین اقامتگاه" : "Your pets and the property's rules"}</h2>
              {booking.pets.length ? <ul className="flex flex-wrap gap-2">{booking.pets.map((p) => <li key={p.petId} className="rounded-full bg-surface-subtle px-3 py-1 text-sm">{p.petName}</li>)}</ul> : <p className="text-sm text-text-secondary">{fa ? "حیوانی برای این رزرو انتخاب نشده است." : "No pets are on this booking."}</p>}
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {policyFacts(booking.petPolicySnapshot, lang).slice(0, 9).map((f) => <div key={f.label} className="flex justify-between gap-3 border-b border-border-subtle py-1.5 text-sm"><dt className="text-text-secondary">{f.label}</dt><dd>{f.value}</dd></div>)}
              </dl>
              {needsAck ? (
                <label className="flex items-start gap-3 rounded-md border border-state-attention/40 bg-state-attention/10 p-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>{fa ? "می‌دانم برخی اطلاعات (مثل قوانین اعلام‌نشده یا وزن ثبت‌نشدهٔ حیوان) کامل نیست و پیش از سفر با اقامتگاه هماهنگ می‌کنم." : "I understand some information (unstated rules or a missing pet weight) is incomplete and I will confirm with the property before travelling."}</span>
                </label>
              ) : null}
              {(booking.petPolicySnapshot?.vaccinationRequired || booking.petPolicySnapshot?.healthCertificateRequired) ? (
                <p className="rounded-md bg-surface-subtle p-3 text-sm">{fa ? "این اقامتگاه مدرک سلامت/واکسن خواسته است. پس از ثبت رزرو می‌توانید فقط همان مدرک را، تا یک روز پس از خروج، با اقامتگاه به اشتراک بگذارید." : "This property asks for vaccination/health proof. After booking you can share just that document with the property, until one day after check-out."}</p>
              ) : null}
              <Button disabled={needsAck && !ack} onClick={() => setStep("trip")}>{fa ? "ادامه" : "Continue"}</Button>
            </section>
          ) : null}

          {step === "trip" ? (
            <section className="flex flex-col gap-4" aria-labelledby="s-trip">
              <h2 id="s-trip" className="text-section-title">{fa ? "افزودن به سفر" : "Add to a trip"}</h2>
              <p className="text-sm text-text-secondary">{fa ? "با افزودن رزرو به یک سفر، اقامت، مدارک لازم و آمادگی حیوان‌تان را یک‌جا می‌بینید. اختیاری است." : "Adding the booking to a trip keeps the stay, required documents and your pet's readiness in one place. Optional."}</p>
              {trips === null ? <Skeleton className="h-12" /> : (
                <fieldset className="flex flex-col gap-2">
                  <legend className="sr-only">{fa ? "سفر" : "Trip"}</legend>
                  <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="trip" className="h-5 w-5" checked={tripId === ""} onChange={() => setTripId("")} />{fa ? "فعلاً نه" : "Not now"}</label>
                  {trips.filter((t) => booking.pets.some((p) => p.petId === t.petId)).map((t) => (
                    <label key={t.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="trip" className="h-5 w-5" checked={tripId === t.id} onChange={() => setTripId(t.id)} />{`${t.petName} · ${t.destinationCity ?? t.destinationCountry} · ${formatDay(t.departAt.slice(0, 10), lang)}`}</label>
                  ))}
                </fieldset>
              )}
              <p className="text-metadata text-text-secondary">{fa ? "سفر جدید را می‌توانید از پروفایل حیوان بسازید و بعداً این رزرو را به آن اضافه کنید." : "You can create a new trip from your pet's profile and add this booking to it later."}</p>
              <div className="flex gap-3"><Button variant="ghost" onClick={() => setStep("pets")}>{fa ? "قبلی" : "Back"}</Button><Button className="flex-1" onClick={() => setStep("review")}>{fa ? "ادامه" : "Continue"}</Button></div>
            </section>
          ) : null}

          {step === "review" ? (
            <section className="flex flex-col gap-4" aria-labelledby="s-review">
              <h2 id="s-review" className="text-section-title">{fa ? "بازبینی نهایی" : "Final review"}</h2>
              {bd ? (
                <dl className="flex flex-col gap-1.5 rounded-md bg-surface-subtle p-3 text-sm">
                  <div className="flex justify-between"><dt>{fa ? "اقامت" : "Stay"}</dt><dd className="tabular-nums">{money(bd.staySubtotalIrr, lang)}</dd></div>
                  {bd.rateAdjustmentIrr ? <div className="flex justify-between"><dt>{fa ? "تعدیل نرخ" : "Rate adjustment"}</dt><dd className="tabular-nums">{bd.rateAdjustmentIrr > 0 ? "+" : "−"}{money(Math.abs(bd.rateAdjustmentIrr), lang)}</dd></div> : null}
                  {bd.petFeeIrr ? <div className="flex justify-between"><dt>{fa ? "هزینهٔ حیوان" : "Pet fee"}</dt><dd className="tabular-nums">{money(bd.petFeeIrr, lang)}</dd></div> : null}
                  {bd.petDepositIrr ? <div className="flex justify-between"><dt>{fa ? "ودیعهٔ حیوان" : "Pet deposit"}</dt><dd className="tabular-nums">{money(bd.petDepositIrr, lang)}</dd></div> : null}
                  {bd.discountIrr ? <div className="flex justify-between"><dt>{fa ? "تخفیف" : "Discount"}</dt><dd className="tabular-nums">−{money(bd.discountIrr, lang)}</dd></div> : null}
                  <div className="flex justify-between border-t border-border-subtle pt-1.5 font-bold"><dt>{fa ? "جمع کل" : "Total"}</dt><dd className="tabular-nums">{money(bd.totalIrr, lang)}</dd></div>
                  <div className="flex justify-between"><dt>{fa ? "پرداخت اکنون" : "Pay now"}</dt><dd className="tabular-nums">{money(bd.payNowIrr, lang)}</dd></div>
                  {bd.payLaterIrr ? <div className="flex justify-between"><dt>{fa ? "پرداخت در محل" : "Pay at the property"}</dt><dd className="tabular-nums">{money(bd.payLaterIrr, lang)}</dd></div> : null}
                </dl>
              ) : null}
              <div className="flex flex-col gap-1 text-sm">
                <p><span className="font-bold">{fa ? "شرایط لغو: " : "Cancellation: "}</span>{plan ? cancellationSummary(plan, lang) : booking.cancellationPolicySnapshot ?? (fa ? "اعلام نشده" : "Not specified")}</p>
                <p><span className="font-bold">{fa ? "پرداخت: " : "Payment: "}</span>{paymentTimingSummary(plan, lang)}</p>
                <p className="text-metadata text-text-secondary">{fa ? "این شرایط همراه رزرو ذخیره می‌شود و تغییرات بعدی اقامتگاه روی آن اثری ندارد." : "These terms are saved with the booking; later changes by the property do not affect it."}</p>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{fa ? "پیام به اقامتگاه (اختیاری)" : "Message to the property (optional)"}</span>
                <textarea maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-24 rounded-md border border-border-subtle bg-surface-base p-2" placeholder={fa ? "مثلاً ساعت تقریبی رسیدن یا نیاز خاص حیوان" : "e.g. arrival time or a special need of your pet"} />
              </label>
              <p className="text-metadata text-text-secondary">{fa ? "اقامتگاه فقط نام و گونهٔ حیوان و همین پیام را می‌بیند؛ پروندهٔ سلامت به اشتراک گذاشته نمی‌شود مگر خودتان مدرکی را به اشتراک بگذارید." : "The property sees only your pets' names and species and this message; no health record is shared unless you share a document yourself."}</p>
              {booking.bookingMode === "REQUEST_TO_BOOK" ? <p className="rounded-md bg-surface-subtle p-3 text-sm">{fa ? "این اقامتگاه درخواست‌ها را خودش تأیید می‌کند. تا پذیرش درخواست مبلغی دریافت نمی‌شود؛ پس از پذیرش ۲۴ ساعت برای پرداخت فرصت دارید." : "This property approves requests itself. Nothing is charged until it accepts; after acceptance you have 24 hours to pay."}</p> : null}
              {error ? <p role="alert" className="text-sm text-state-urgent">{error}</p> : null}
              <div className="flex gap-3"><Button variant="ghost" onClick={() => setStep("trip")}>{fa ? "قبلی" : "Back"}</Button>
                <Button className="flex-1" isLoading={busy} onClick={() => void submit()}>
                  {booking.bookingMode === "REQUEST_TO_BOOK" ? (fa ? "ارسال درخواست رزرو" : "Send booking request") : bd && bd.payNowIrr > 0 ? (fa ? "ثبت و رفتن به پرداخت" : "Confirm and go to payment") : fa ? "ثبت رزرو" : "Confirm booking"}
                </Button>
              </div>
            </section>
          ) : null}

          {step === "pay" ? (
            <section className="flex flex-col gap-4" aria-labelledby="s-pay">
              <h2 id="s-pay" className="text-section-title">{fa ? "پرداخت" : "Payment"}</h2>
              <p className="text-body">{fa ? `مبلغ قابل پرداخت اکنون: ` : "Due now: "}<span className="font-bold tabular-nums">{money(booking.payNowAmountIrr, lang)}</span></p>
              {booking.requestExpiresAt ? <p className="flex items-center gap-2 text-sm text-text-secondary"><Timer aria-hidden className="h-4 w-4" />{payLeft > 0 ? (fa ? `مهلت پرداخت: ${countdown(Math.min(payLeft, 99 * 60_000), lang)}${payLeft > 99 * 60_000 ? "+" : ""}` : `Payment window: ${countdown(Math.min(payLeft, 99 * 60_000), lang)}${payLeft > 99 * 60_000 ? "+" : ""}`) : fa ? "مهلت پرداخت تمام شده است." : "The payment window has closed."}</p> : null}
              <p className="flex items-start gap-2 text-metadata text-text-secondary"><ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />{fa ? "پرداخت از طریق درگاه پرداخت PET LIFE انجام می‌شود. رزرو فقط وقتی تأیید می‌شود که درگاه موفقیت پرداخت را اعلام کند." : "Payment goes through PET LIFE's payment gateway. The booking is confirmed only when the gateway reports success."}</p>
              {error ? <p role="alert" className="text-sm text-state-urgent">{error}</p> : null}
              <Button size="lg" isLoading={busy} disabled={payLeft <= 0} onClick={() => void pay()}>{fa ? `پرداخت ${money(booking.payNowAmountIrr, lang)}` : `Pay ${money(booking.payNowAmountIrr, lang)}`}</Button>
            </section>
          ) : null}
        </>
      ) : (
        <section className="flex flex-col gap-4" aria-labelledby="s-done">
          <h2 id="s-done" className="sr-only">{fa ? "نتیجه" : "Result"}</h2>
          <StatusLabel tone={bookingStatusTone(booking.status)}>{bookingStatusLabel(booking.status, lang)}</StatusLabel>
          <p className="text-body">
            {booking.status === "CONFIRMED"
              ? fa ? "رزرو شما تأیید شد. جزئیات و مدیریت رزرو در صفحهٔ رزرو است." : "Your booking is confirmed. Details and changes are on the booking page."
              : booking.status === "AWAITING_PROVIDER"
                ? fa ? "درخواست شما برای اقامتگاه ارسال شد. پاسخ اقامتگاه را اطلاع می‌دهیم؛ اگر تا مهلت تعیین‌شده پاسخی نرسد، درخواست منقضی و تاریخ‌ها آزاد می‌شوند. تا پذیرش، مبلغی دریافت نمی‌شود." : "Your request was sent to the property. We will notify you of the answer; if there is none by the deadline the request expires and the dates are released. Nothing is charged until it is accepted."
                : fa ? "وضعیت این رزرو در صفحهٔ رزرو قابل پیگیری است." : "Follow this booking on its page."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/${lang}/travel/bookings/${booking.id}`} className="inline-flex min-h-11 items-center rounded-full bg-brand-natural px-5 font-bold text-text-inverse">{fa ? "مشاهدهٔ رزرو" : "View booking"}</Link>
            {booking.tripId ? <Link href={`/${lang}/travel/trips/${booking.tripId}`} className="inline-flex min-h-11 items-center rounded-full border border-border-subtle px-5">{fa ? "مشاهدهٔ سفر" : "View trip"}</Link> : null}
            <Link href={`/${lang}/insurance`} className="inline-flex min-h-11 items-center rounded-full border border-border-subtle px-5">{fa ? "بیمهٔ سفر حیوان" : "Pet insurance"}</Link>
          </div>
        </section>
      )}
    </div>
  );
}
