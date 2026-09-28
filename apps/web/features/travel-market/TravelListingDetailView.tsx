"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Button, Dialog, EmptyState, ErrorRecovery, Heart, MapPin, Skeleton, StatusLabel, Star, Stethoscope } from "@petlife/ui";
import type { TravelAvailabilityDayDto, TravelListingDetailDto, TravelQuoteDto, TravelReviewDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { randomId } from "@/lib/id/random-id";
import { addDays, daysBetween, formatDay, isIsoDay, localizeDigits, todayIso } from "@/lib/date/jalali";
import { DateRangeField, type DateRangeValue } from "@/features/shared/date-picker/DateRangePicker";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { useSessionStore } from "@/stores/session-store";
import { amenityLabel, cancellationSummary, listingTypeLabel, MATCH_LABEL, matchReason, matchTone, money, paymentTimingSummary, policyFacts, ratingText } from "./labels";
import { readChosenPetIds, useMyPets, writeChosenPetIds } from "./use-my-pets";

/**
 * TRAVEL LISTING DETAIL PATTERN. Everything the traveller must know before paying is on this page
 * and comes from the property's own statements: pet rules (unknown shown as "Not specified"),
 * units, rate plans with plain-language terms, and a server-priced whole-stay breakdown. Reserving
 * places a 15-minute hold on the exact nights; nothing is charged here.
 */
export function TravelListingDetailView({ listingId }: { listingId: string }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const session = useSessionStore((s) => s.status);
  const myPets = useMyPets();
  const [listing, setListing] = useState<TravelListingDetailDto | null>(null);
  const [load, setLoad] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<string | null>(params.get("unitId"));
  const [ratePlanId, setRatePlanId] = useState<string | null>(params.get("ratePlanId"));
  const [range, setRange] = useState<DateRangeValue>(() => {
    const ci = params.get("checkIn");
    const co = params.get("checkOut");
    return isIsoDay(ci) && isIsoDay(co) && co > ci ? { start: ci, end: co } : { start: null, end: null };
  });
  const [petIds, setPetIds] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<TravelAvailabilityDayDto[]>([]);
  const [quote, setQuote] = useState<TravelQuoteDto | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<TravelReviewDto[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [moreReviews, setMoreReviews] = useState(false);
  const [holdKey] = useState(() => randomId());

  const fetchListing = useCallback(async () => {
    setLoad("loading");
    try {
      const l = await travelMarketService.detail(listingId);
      setListing(l);
      setReviews(l.reviews);
      setMoreReviews(l.rating.count > l.reviews.length);
      const firstUnit = l.units.find((u) => u.isActive);
      setUnitId((u) => (u && l.units.some((x) => x.id === u) ? u : firstUnit?.id ?? null));
      setLoad("ready");
    } catch (e) {
      setLoad(e instanceof ApiError && e.status === 404 ? "notFound" : "error");
    }
  }, [listingId]);
  useEffect(() => void fetchListing(), [fetchListing]);

  useEffect(() => {
    if (!myPets) return;
    const remembered = readChosenPetIds().filter((id) => myPets.some((p) => p.id === id));
    setPetIds(remembered.length ? remembered : myPets.length === 1 ? [myPets[0]!.id] : []);
  }, [myPets]);

  const unit = listing?.units.find((u) => u.id === unitId) ?? null;
  const plans = useMemo(() => unit?.ratePlans.filter((p) => p.isActive) ?? [], [unit]);
  useEffect(() => {
    if (!plans.length) return setRatePlanId(null);
    setRatePlanId((id) => (id && plans.some((p) => p.id === id) ? id : plans[0]!.id));
  }, [plans]);
  const plan = plans.find((p) => p.id === ratePlanId) ?? null;

  // Real nightly availability for the chosen room (next 62 days from the visible start).
  useEffect(() => {
    if (!unitId || !listing) return;
    const from = range.start && range.start > todayIso() ? addDays(range.start, -14) : todayIso();
    const start = from < todayIso() ? todayIso() : from;
    travelMarketService.unitCalendar(listing.id, unitId, start, addDays(start, 61)).then(setCalendar).catch(() => setCalendar([]));
  }, [unitId, listing, range.start]);
  const unavailable = useMemo(() => new Set(calendar.filter((d) => !d.isAvailable).map((d) => d.date)), [calendar]);

  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!listing || !unitId || !range.start || !range.end) return;
    if (plans.length && !ratePlanId) return;
    let cancelled = false;
    travelMarketService
      .quote(listing.id, { unitId, ratePlanId: ratePlanId ?? undefined, checkIn: range.start, checkOut: range.end, petIds: session === "authenticated" && petIds.length ? petIds : undefined })
      .then((q) => !cancelled && setQuote(q))
      .catch((e) => {
        if (cancelled) return;
        const reason = e instanceof ApiError ? (e.details?.reason as string | undefined) : undefined;
        setQuoteError(reason === "RATE_PLAN_NOT_AVAILABLE_FOR_STAY" ? (fa ? "این نرخ برای این تاریخ‌ها ارائه نمی‌شود (حداقل شب یا بازهٔ اعتبار)." : "This rate is not offered for these dates (minimum nights or validity window).") : fa ? "قیمت این بازه محاسبه نشد. تاریخ یا نرخ دیگری انتخاب کنید." : "This stay could not be priced. Try other dates or another rate.");
      });
    return () => {
      cancelled = true;
    };
  }, [listing, unitId, ratePlanId, range.start, range.end, petIds, session, plans.length, fa]);

  const toggleFavorite = async () => {
    if (!listing) return;
    if (session !== "authenticated") return router.push(`/${lang}/welcome?returnTo=${encodeURIComponent(pathname)}`);
    const on = listing.favorited;
    setListing({ ...listing, favorited: !on });
    try {
      await (on ? travelMarketService.unfavorite(listing.id) : travelMarketService.favorite(listing.id));
    } catch {
      setListing((l) => (l ? { ...l, favorited: on } : l));
    }
  };

  const reserve = async () => {
    if (!listing || !unitId || !range.start || !range.end) return;
    if (session !== "authenticated") {
      const q = new URLSearchParams({ checkIn: range.start, checkOut: range.end, unitId, ...(ratePlanId ? { ratePlanId } : {}) });
      return router.push(`/${lang}/welcome?returnTo=${encodeURIComponent(`${pathname}?${q}`)}`);
    }
    setBusy(true);
    setHoldError(null);
    try {
      writeChosenPetIds(petIds);
      const b = await travelMarketService.hold({ listingId: listing.id, unitId, ratePlanId: ratePlanId ?? undefined, checkIn: range.start, checkOut: range.end, petIds });
      void holdKey;
      router.push(`/${lang}/travel/book/${b.id}`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setHoldError(
        e instanceof ApiError && e.status === 409
          ? fa ? "این تاریخ‌ها همین حالا پر شد. تاریخ یا اتاق دیگری انتخاب کنید." : "These dates were just taken. Choose other dates or another room."
          : code === "VALIDATION_ERROR"
            ? fa ? "حیوان انتخاب‌شده با قوانین اعلام‌شدهٔ این اقامتگاه جور نیست، یا تاریخ‌ها معتبر نیستند." : "The selected pet does not fit this property's stated rules, or the dates are not valid."
            : fa ? "نگه‌داشتن تاریخ‌ها انجام نشد. دوباره تلاش کنید." : "The dates could not be held. Please try again.",
      );
      setBusy(false);
    }
  };

  const loadMoreReviews = async () => {
    if (!listing) return;
    const next = reviewPage + 1;
    try {
      const res = await travelMarketService.reviews(listing.id, next);
      setReviews((r) => [...r, ...res.items.filter((x) => !r.some((y) => y.id === x.id))]);
      setReviewPage(next);
      setMoreReviews(next * res.pageSize < res.total);
    } catch {
      setMoreReviews(false);
    }
  };

  if (load === "loading") return <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6"><Skeleton className="h-72 w-full" /><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 w-full" /></div>;
  if (load === "notFound") return <div className="mx-auto max-w-3xl px-4 py-10"><EmptyState title={fa ? "این اقامتگاه در دسترس نیست" : "This stay is not available"} description={fa ? "ممکن است منتشر نشده یا حذف شده باشد." : "It may be unpublished or removed."} actionLabel={fa ? "جستجوی اقامتگاه‌ها" : "Search stays"} onAction={() => router.push(`/${lang}/travel`)} /></div>;
  if (load === "error" || !listing) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void fetchListing()} /></div>;

  const images = listing.media.length ? listing.media.map((m) => ({ url: m.url, alt: m.alt ?? listing.title })) : listing.imageUrls.map((url) => ({ url, alt: listing.title }));
  const chosenPets = myPets?.filter((p) => petIds.includes(p.id)) ?? [];
  const nights = range.start && range.end ? daysBetween(range.start, range.end) : 0;
  const unitPlanMinNights = plan?.minNights ?? 1;
  const canReserve = !!quote && quote.isBookable && quote.petPolicyMatch?.outcome !== "POTENTIAL_CONFLICT" && !busy;

  const bookingPanel = (
    <div className="flex flex-col gap-4">
      {listing.units.filter((u) => u.isActive).length === 0 ? (
        <p className="text-body text-text-secondary">{fa ? "این اقامتگاه هنوز واحد قابل رزروی ثبت نکرده است." : "This property has not listed a bookable room yet."}</p>
      ) : (
        <>
          <DateRangeField label={fa ? "تاریخ اقامت" : "Stay dates"} value={range} onChange={setRange} min={todayIso()} max={addDays(todayIso(), 365)} isUnavailable={(d) => unavailable.has(d)} minNights={unitPlanMinNights} />
          {session === "authenticated" && myPets && myPets.length > 0 ? (
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-text-primary">{fa ? "کدام حیوانات همراه شما هستند؟" : "Which pets are coming?"}</legend>
              <div className="flex flex-wrap gap-2">
                {myPets.map((p) => {
                  const on = petIds.includes(p.id);
                  return <button key={p.id} type="button" aria-pressed={on} onClick={() => setPetIds(on ? petIds.filter((x) => x !== p.id) : [...petIds, p.id].slice(0, 5))} className={`min-h-11 rounded-full border px-3 text-sm ${on ? "border-brand-natural bg-brand-natural/10" : "border-border-subtle text-text-secondary"}`}>{on ? "✓ " : ""}{p.name}</button>;
                })}
              </div>
            </fieldset>
          ) : session !== "authenticated" ? (
            <p className="text-metadata text-text-secondary">{fa ? "برای بررسی دقیق تطابق با حیوان خودتان، وارد شوید." : "Sign in to check the match against your own pet's profile."}</p>
          ) : null}
          {quote?.petPolicyMatch && chosenPets.length > 0 ? (
            <div className="rounded-md border border-border-subtle p-3" aria-live="polite">
              <StatusLabel tone={matchTone(quote.petPolicyMatch.outcome)}>{MATCH_LABEL[quote.petPolicyMatch.outcome][fa ? 0 : 1]}</StatusLabel>
              {quote.petPolicyMatch.reasons.length ? <ul className="mt-2 list-disc ps-5 text-sm text-text-primary">{quote.petPolicyMatch.reasons.map((r, i) => <li key={i}>{matchReason(r, lang)}</li>)}</ul> : <p className="mt-2 text-sm text-text-secondary">{fa ? "بر اساس قوانین اعلام‌شده و پروفایل حیوان شما. ضمانت ایمنی نیست." : "Based on the stated rules and your pet's profile. Not a safety guarantee."}</p>}
            </div>
          ) : null}
          {quoteError ? <p role="alert" className="text-sm text-state-urgent">{quoteError}</p> : null}
          {quote && !quote.isBookable ? <p role="alert" className="text-sm text-state-urgent">{fa ? `این اتاق در ${formatDay(quote.unavailableDate ?? range.start!, lang)} پر است.` : `This room is full on ${formatDay(quote.unavailableDate ?? range.start!, lang)}.`}</p> : null}
          {quote && quote.isBookable ? <PriceBreakdown quote={quote} /> : null}
          {holdError ? <p role="alert" className="text-sm text-state-urgent">{holdError}</p> : null}
          <Button size="lg" disabled={!!range.start && !canReserve && session === "authenticated"} isLoading={busy} onClick={() => void reserve()}>
            {session !== "authenticated" ? (fa ? "ورود و ادامهٔ رزرو" : "Sign in to reserve") : listing.bookingMode === "REQUEST_TO_BOOK" ? (fa ? "ادامه: درخواست رزرو" : "Continue: request to book") : fa ? "ادامه: رزرو" : "Continue: reserve"}
          </Button>
          <p className="text-metadata text-text-secondary">{fa ? "در مرحلهٔ بعد تاریخ‌ها ۱۵ دقیقه برای شما نگه داشته می‌شوند. هنوز مبلغی کسر نمی‌شود." : "Next, the dates are held for you for 15 minutes. Nothing is charged yet."}</p>
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 pb-28 lg:pb-6">
      <nav aria-label={fa ? "مسیر" : "Breadcrumb"} className="text-metadata text-text-secondary">
        <Link href={`/${lang}/travel`} className="hover:underline">{fa ? "سفر" : "Travel"}</Link> / <Link href={`/${lang}/travel/search?city=${encodeURIComponent(listing.city)}`} className="hover:underline">{listing.city}</Link>
      </nav>

      {images.length ? (
        <div className="grid gap-2 md:grid-cols-4 md:grid-rows-2">
          {images.slice(0, 5).map((img, i) => (
            <button key={img.url + i} type="button" onClick={() => setLightbox(i)} className={`relative overflow-hidden rounded-md bg-surface-subtle focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${i === 0 ? "aspect-[4/3] md:col-span-2 md:row-span-2 md:aspect-auto" : "hidden aspect-[4/3] md:block"}`} aria-label={fa ? `نمایش تصویر ${localizeDigits(i + 1, "fa")} از ${localizeDigits(images.length, "fa")}` : `Open photo ${i + 1} of ${images.length}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-md bg-surface-subtle text-text-secondary">{fa ? "اقامتگاه تصویری ارائه نکرده است" : "The property has not provided photos"}</div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-metadata text-text-secondary">
              <span>{listingTypeLabel(listing.type, lang)}</span>
              <span>· {listing.city}{listing.province ? `، ${listing.province}` : ""}</span>
              {listing.isVerified ? <span className="inline-flex items-center gap-1 text-state-success"><BadgeCheck aria-hidden className="h-4 w-4" />{fa ? "تأییدشده توسط PET LIFE" : "Verified by PET LIFE"}</span> : null}
            </div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-page-title text-text-primary">{listing.title}</h1>
              <button type="button" onClick={() => void toggleFavorite()} aria-pressed={listing.favorited} aria-label={listing.favorited ? (fa ? "حذف از ذخیره‌ها" : "Remove from saved") : fa ? "ذخیره" : "Save"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-subtle">
                <Heart aria-hidden className={`h-5 w-5 ${listing.favorited ? "fill-current text-state-urgent" : ""}`} />
              </button>
            </div>
            <p className="flex items-center gap-1 text-sm text-text-secondary"><Star aria-hidden className="h-4 w-4" />{ratingText(listing.rating.average, listing.rating.count, lang)}</p>
            <p className="text-metadata text-text-secondary">{fa ? `میزبان: ${listing.organizationName}` : `Hosted by ${listing.organizationName}`}</p>
          </header>

          <section aria-labelledby="pet-policy" className="flex flex-col gap-3">
            <h2 id="pet-policy" className="text-section-title text-text-primary">{fa ? "قوانین حیوانات (به اعلام اقامتگاه)" : "Pet rules (as stated by the property)"}</h2>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {policyFacts(listing.petPolicy, lang).map((f) => (
                <div key={f.label} className="flex justify-between gap-3 border-b border-border-subtle py-2 text-sm">
                  <dt className="text-text-secondary">{f.label}</dt>
                  <dd className="text-end text-text-primary">{f.value}</dd>
                </div>
              ))}
            </dl>
            {listing.petPolicy?.notes ? <p className="text-sm text-text-primary">{listing.petPolicy.notes}</p> : null}
            <p className="text-metadata text-text-secondary">{fa ? "PET LIFE این قوانین را تغییر نمی‌دهد و تضمین نمی‌کند؛ در صورت تردید پیش از سفر با اقامتگاه هماهنگ کنید." : "PET LIFE does not alter or guarantee these rules; if in doubt, confirm with the property before travelling."}</p>
          </section>

          <section aria-labelledby="about" className="flex flex-col gap-3">
            <h2 id="about" className="text-section-title text-text-primary">{fa ? "دربارهٔ اقامتگاه" : "About this stay"}</h2>
            <p className="whitespace-pre-line text-body text-text-primary">{listing.description}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-text-secondary">{fa ? "ساعت ورود" : "Check-in"}</dt><dd>{listing.checkInFrom ? (fa ? `از ${localizeDigits(listing.checkInFrom, "fa")}` : `From ${listing.checkInFrom}`) : fa ? "اعلام نشده" : "Not specified"}</dd></div>
              <div><dt className="text-text-secondary">{fa ? "ساعت خروج" : "Check-out"}</dt><dd>{listing.checkOutUntil ? (fa ? `تا ${localizeDigits(listing.checkOutUntil, "fa")}` : `Until ${listing.checkOutUntil}`) : fa ? "اعلام نشده" : "Not specified"}</dd></div>
            </dl>
            {listing.houseRules ? <div><h3 className="font-bold text-text-primary">{fa ? "قوانین اقامتگاه" : "House rules"}</h3><p className="whitespace-pre-line text-sm text-text-primary">{listing.houseRules}</p></div> : null}
            {listing.amenities.length ? <ul className="flex flex-wrap gap-2">{listing.amenities.map((a) => <li key={a} className="rounded-full bg-surface-subtle px-3 py-1 text-sm">{amenityLabel(a, lang)}</li>)}</ul> : null}
          </section>

          <section aria-labelledby="rooms" className="flex flex-col gap-3">
            <h2 id="rooms" className="text-section-title text-text-primary">{fa ? "اتاق‌ها و نرخ‌ها" : "Rooms and rates"}</h2>
            {listing.units.filter((u) => u.isActive).map((u) => (
              <div key={u.id} className={`rounded-md border p-4 ${u.id === unitId ? "border-brand-natural" : "border-border-subtle"}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="radio" name="unit" className="mt-1 h-5 w-5" checked={u.id === unitId} onChange={() => setUnitId(u.id)} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-bold text-text-primary">{u.name}</span>
                    <span className="text-metadata text-text-secondary">
                      {[u.maxOccupancy ? (fa ? `تا ${localizeDigits(u.maxOccupancy, "fa")} نفر` : `Up to ${u.maxOccupancy} guests`) : null, u.bedInfo, u.sizeSqm ? (fa ? `${localizeDigits(u.sizeSqm, "fa")} متر` : `${u.sizeSqm} m²`) : null, u.maxPets ? (fa ? `حداکثر ${localizeDigits(u.maxPets, "fa")} حیوان` : `Up to ${u.maxPets} pets`) : null].filter(Boolean).join(" · ")}
                    </span>
                    {u.petNotes ? <span className="text-sm text-text-primary">{u.petNotes}</span> : null}
                    <span className="text-sm text-text-primary">{fa ? `از ${money(u.basePriceIrr, lang)} هر شب` : `From ${money(u.basePriceIrr, lang)} / night`}</span>
                  </span>
                </label>
                {u.id === unitId && plans.length ? (
                  <fieldset className="mt-3 flex flex-col gap-2 ps-8">
                    <legend className="sr-only">{fa ? "نرخ" : "Rate"}</legend>
                    {plans.map((p) => (
                      <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${p.id === ratePlanId ? "border-brand-natural bg-brand-natural/5" : "border-border-subtle"}`}>
                        <input type="radio" name="plan" className="mt-1 h-5 w-5" checked={p.id === ratePlanId} onChange={() => setRatePlanId(p.id)} />
                        <span className="flex flex-col gap-0.5 text-sm">
                          <span className="font-bold text-text-primary">{p.name}{p.priceModifierPercent ? ` (${p.priceModifierPercent > 0 ? "+" : ""}${localizeDigits(p.priceModifierPercent, lang)}٪)` : ""}</span>
                          <span className="text-text-primary">{cancellationSummary(p, lang)}</span>
                          <span className="text-text-secondary">{paymentTimingSummary(p, lang)}{p.includesBreakfast ? (fa ? " · با صبحانه" : " · breakfast included") : ""}{p.minNights ? (fa ? ` · حداقل ${localizeDigits(p.minNights, "fa")} شب` : ` · min ${p.minNights} nights`) : ""}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : u.id === unitId ? (
                  <p className="mt-2 ps-8 text-metadata text-text-secondary">{listing.cancellationPolicy ? `${fa ? "شرایط لغو: " : "Cancellation: "}${listing.cancellationPolicy}` : fa ? "شرایط لغو اعلام نشده است." : "Cancellation terms not specified."}</p>
                ) : null}
              </div>
            ))}
          </section>

          <section aria-labelledby="reviews" className="flex flex-col gap-3">
            <h2 id="reviews" className="text-section-title text-text-primary">{fa ? "نظرات مهمانان" : "Guest reviews"}</h2>
            <p className="text-metadata text-text-secondary">{fa ? "فقط مهمانانی که اقامتشان در PET LIFE به پایان رسیده می‌توانند نظر بدهند." : "Only guests whose PET LIFE stay was completed can review."}</p>
            {listing.rating.count ? (
              <dl className="flex flex-wrap gap-4 text-sm">
                {[["petFriendliness", fa ? "رفتار با حیوانات" : "Pet friendliness"], ["cleanliness", fa ? "تمیزی" : "Cleanliness"], ["location", fa ? "موقعیت" : "Location"]].map(([k, label]) => {
                  const v = listing.rating[k as "petFriendliness"];
                  return v === null ? null : <div key={k}><dt className="text-text-secondary">{label}</dt><dd className="font-bold">{localizeDigits(v.toFixed(1), lang)}</dd></div>;
                })}
              </dl>
            ) : null}
            {reviews.length === 0 ? <p className="text-body text-text-secondary">{fa ? "هنوز نظری ثبت نشده است." : "No reviews yet."}</p> : (
              <ul className="flex flex-col gap-4">
                {reviews.map((r) => (
                  <li key={r.id} className="border-b border-border-subtle pb-4">
                    <p className="text-sm"><span aria-label={fa ? `${localizeDigits(r.overall, "fa")} از ۵` : `${r.overall} of 5`}>{"★".repeat(r.overall)}{"☆".repeat(5 - r.overall)}</span> · {r.authorName} · {r.stayMonth}</p>
                    {r.body ? <p className="mt-1 text-body text-text-primary">{r.body}</p> : null}
                    {r.providerResponse ? <p className="mt-2 rounded-md bg-surface-subtle p-2 text-sm"><span className="font-bold">{fa ? "پاسخ اقامتگاه: " : "Host response: "}</span>{r.providerResponse}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            {moreReviews ? <Button variant="secondary" size="sm" onClick={() => void loadMoreReviews()}>{fa ? "نظرات بیشتر" : "More reviews"}</Button> : null}
          </section>

          <section aria-labelledby="nearby" className="grid gap-4 md:grid-cols-2">
            <h2 id="nearby" className="sr-only">{fa ? "اطراف اقامتگاه" : "Around the stay"}</h2>
            <div className="rounded-md border border-border-subtle p-4">
              <h3 className="mb-2 flex items-center gap-2 font-bold"><MapPin aria-hidden className="h-4 w-4" />{fa ? "مکان‌های دوستدار حیوانات نزدیک" : "Pet-friendly places nearby"}</h3>
              {listing.nearbyPlaces.length ? <ul className="flex flex-col gap-1 text-sm">{listing.nearbyPlaces.map((p) => <li key={p.id}><Link className="hover:underline" href={`/${lang}/places/${p.id}`}>{p.name}</Link> <span className="text-text-secondary">· {fa ? `${localizeDigits(p.distanceKm.toFixed(1), "fa")} کیلومتر` : `${p.distanceKm.toFixed(1)} km`}</span></li>)}</ul> : <p className="text-sm text-text-secondary">{fa ? "مکان ثبت‌شده‌ای در نزدیکی نداریم." : "No listed places nearby yet."}</p>}
            </div>
            <div className="rounded-md border border-border-subtle p-4">
              <h3 className="mb-2 flex items-center gap-2 font-bold"><Stethoscope aria-hidden className="h-4 w-4" />{fa ? "دامپزشکی در این شهر" : "Vets in this city"}</h3>
              {listing.nearbyVets.length ? <ul className="flex flex-col gap-1 text-sm">{listing.nearbyVets.map((v) => <li key={v.id}><Link className="hover:underline" href={`/${lang}/vet/${v.id}`}>{v.name}</Link>{v.distanceKm !== null ? <span className="text-text-secondary"> · {fa ? `${localizeDigits(v.distanceKm.toFixed(1), "fa")} کیلومتر` : `${v.distanceKm.toFixed(1)} km`}</span> : null}</li>)}</ul> : <p className="text-sm text-text-secondary">{fa ? "دامپزشک ثبت‌شده‌ای در این شهر نداریم." : "No listed vets in this city yet."}</p>}
            </div>
          </section>
          <p className="text-sm text-text-secondary">
            {fa ? "برای سفر، پوشش بیمه‌ای حیوان‌تان را هم بررسی کنید: " : "Travelling? Check your pet's insurance cover too: "}
            <Link className="underline" href={`/${lang}/insurance`}>{fa ? "مقایسهٔ بیمه‌ها" : "compare insurance"}</Link>
          </p>
        </div>

        <aside className="hidden lg:block" aria-label={fa ? "رزرو" : "Booking"}>
          <div className="sticky top-4 rounded-lg border border-border-subtle bg-surface-elevated p-4">{bookingPanel}</div>
        </aside>
      </div>

      <section className="lg:hidden" aria-label={fa ? "رزرو" : "Booking"} id="book">
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4">{bookingPanel}</div>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-elevated px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="min-w-0 text-sm">
          {quote?.isBookable ? <><p className="font-bold tabular-nums">{money(quote.totalAmountIrr, lang)}</p><p className="text-metadata text-text-secondary">{fa ? `${localizeDigits(nights, "fa")} شب` : `${nights} nights`}</p></> : <p className="text-text-secondary">{fa ? "تاریخ را انتخاب کنید" : "Choose dates"}</p>}
        </div>
        <a href="#book" className="inline-flex min-h-11 items-center rounded-full bg-brand-natural px-5 font-bold text-text-inverse">{fa ? "رزرو" : "Reserve"}</a>
      </div>

      <Dialog open={lightbox !== null} onClose={() => setLightbox(null)} title={fa ? "تصاویر" : "Photos"} className="max-w-4xl">
        {lightbox !== null && images[lightbox] ? (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[lightbox]!.url} alt={images[lightbox]!.alt} className="max-h-[70dvh] w-full rounded-md object-contain" />
            <div className="flex items-center justify-between">
              <Button variant="secondary" size="sm" disabled={lightbox === 0} onClick={() => setLightbox(lightbox - 1)}>{fa ? "قبلی" : "Previous"}</Button>
              <span className="text-sm text-text-secondary">{localizeDigits(lightbox + 1, lang)} / {localizeDigits(images.length, lang)}</span>
              <Button variant="secondary" size="sm" disabled={lightbox >= images.length - 1} onClick={() => setLightbox(lightbox + 1)}>{fa ? "بعدی" : "Next"}</Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

export function PriceBreakdown({ quote }: { quote: Pick<TravelQuoteDto, "nights" | "nightly" | "baseAmountIrr" | "discountAmountIrr" | "petFeeAmountIrr" | "depositAmountIrr" | "totalAmountIrr" | "payNowAmountIrr" | "payLaterAmountIrr"> }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const stay = quote.nightly.reduce((s, n) => s + n.priceIrr, 0);
  const adjustment = quote.baseAmountIrr - stay;
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? "font-bold text-text-primary" : "text-text-primary"}`}><dt>{label}</dt><dd className="tabular-nums">{value}</dd></div>
  );
  return (
    <dl className="flex flex-col gap-1.5 rounded-md bg-surface-subtle p-3 text-sm" aria-label={fa ? "جزئیات قیمت" : "Price details"}>
      <details>
        <summary className="flex cursor-pointer justify-between gap-3"><span>{fa ? `${localizeDigits(quote.nights, "fa")} شب اقامت` : `${quote.nights} night${quote.nights === 1 ? "" : "s"}`}</span><span className="tabular-nums">{money(stay, lang)}</span></summary>
        <ul className="mt-1 flex flex-col gap-0.5 ps-3 text-metadata text-text-secondary">{quote.nightly.map((n) => <li key={n.date} className="flex justify-between"><span>{formatDay(n.date, lang, { weekday: true, year: false })}</span><span className="tabular-nums">{money(n.priceIrr, lang)}</span></li>)}</ul>
      </details>
      {adjustment !== 0 ? row(fa ? "تعدیل نرخ" : "Rate adjustment", `${adjustment > 0 ? "+" : "−"}${money(Math.abs(adjustment), lang)}`) : null}
      {quote.discountAmountIrr ? row(fa ? "تخفیف" : "Discount", `−${money(quote.discountAmountIrr, lang)}`) : null}
      {quote.petFeeAmountIrr ? row(fa ? "هزینهٔ حیوان" : "Pet fee", money(quote.petFeeAmountIrr, lang)) : null}
      {quote.depositAmountIrr ? row(fa ? "ودیعهٔ حیوان (قابل استرداد طبق قوانین اقامتگاه)" : "Pet deposit (refundable per property rules)", money(quote.depositAmountIrr, lang)) : null}
      <div className="my-1 border-t border-border-subtle" />
      {row(fa ? "جمع کل" : "Total", money(quote.totalAmountIrr, lang), true)}
      {row(fa ? "پرداخت اکنون" : "Pay now", money(quote.payNowAmountIrr, lang))}
      {quote.payLaterAmountIrr ? row(fa ? "پرداخت در محل" : "Pay at the property", money(quote.payLaterAmountIrr, lang)) : null}
    </dl>
  );
}
