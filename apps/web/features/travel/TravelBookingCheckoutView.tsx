"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { TravelBookingDto, TravelListingDto, TravelQuoteDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { travelMarketplaceService } from "@/services/travel-marketplace.service";

const COPY = {
  en: { title: "Confirm your stay", unit: "Unit", checkIn: "Check-in", checkOut: "Check-out", quote: "Check live price", submit: "Request booking", unavailable: "This stay is unavailable for these dates.", ready: "Your booking is registered.", pending: "The provider will review your request.", confirmed: "Your stay is confirmed.", error: "We could not complete this booking.", back: "Back to listing", total: "Estimated total", currency: "IRR", travel: "View pet travel" },
  fa: { title: "تأیید اقامت", unit: "واحد", checkIn: "تاریخ ورود", checkOut: "تاریخ خروج", quote: "بررسی قیمت و ظرفیت", submit: "ثبت درخواست رزرو", unavailable: "این اقامتگاه در تاریخ‌های انتخاب‌شده ظرفیت ندارد.", ready: "درخواست رزرو شما ثبت شد.", pending: "ارائه‌دهنده درخواست شما را بررسی می‌کند.", confirmed: "اقامت شما تأیید شد.", error: "ثبت این رزرو ممکن نشد.", back: "بازگشت به اقامتگاه", total: "مجموع برآوردی", currency: "ریال", travel: "مشاهده سفرهای حیوان" },
} as const;

export function TravelBookingCheckoutView({ petId, listingId }: { petId: string; listingId: string }) {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const copy = COPY[locale];
  const searchParams = useSearchParams();
  const [listing, setListing] = useState<TravelListingDto | null>(null);
  const [unitId, setUnitId] = useState(searchParams.get("unitId") ?? "");
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") ?? "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") ?? "");
  const [quote, setQuote] = useState<TravelQuoteDto | null>(null);
  const [booking, setBooking] = useState<TravelBookingDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load(): Promise<void> {
    setError(null);
    try {
      const result = await travelMarketplaceService.getListing(listingId);
      setListing(result);
      setUnitId((current) => current || result.units[0]?.id || "");
    } catch (err) { setError(err instanceof ApiError ? err.message : copy.error); }
  }

  // The fetch is intentionally keyed to the route identity, not the locally recreated callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [listingId]);

  async function refreshQuote(): Promise<TravelQuoteDto | null> {
    if (!unitId || !checkIn || !checkOut) return null;
    setError(null);
    try {
      const result = await travelMarketplaceService.quote(listingId, { unitId, checkIn, checkOut, petCount: 1 });
      setQuote(result);
      return result;
    } catch (err) { setError(err instanceof ApiError ? err.message : copy.error); return null; }
  }

  async function submit(): Promise<void> {
    setIsSubmitting(true);
    const currentQuote = quote ?? await refreshQuote();
    if (!currentQuote?.isBookable) { setIsSubmitting(false); return; }
    try { setBooking(await travelMarketplaceService.createBooking(petId, listingId, { unitId, checkIn, checkOut })); }
    catch (err) { setError(err instanceof ApiError ? err.message : copy.error); }
    finally { setIsSubmitting(false); }
  }

  if (error && !listing) return <ErrorRecovery title={copy.error} message={error} retryLabel={locale === "fa" ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!listing) return <Skeleton className="h-72 w-full" aria-label={copy.title} />;
  const number = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US");
  const selectedUnit = listing.units.find((unit) => unit.id === unitId);

  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <Link href={`/travel/${listingId}?petId=${petId}`} className="w-fit text-body text-brand-natural">← {copy.back}</Link>
    <header><h1 className="text-page-title text-text-primary">{copy.title}</h1><p className="mt-2 text-body text-text-secondary">{listing.title}</p></header>
    {booking ? <ContextSurface className="space-y-3"><StatusLabel tone="success">{copy.ready}</StatusLabel><p className="text-body text-text-primary">{booking.status === "CONFIRMED" ? copy.confirmed : copy.pending}</p><Link href={`/pets/${petId}/travel`}><Button variant="primary">{copy.travel}</Button></Link></ContextSurface> : <ContextSurface className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-body text-text-primary">{copy.unit}<select value={unitId} onChange={(event) => { setUnitId(event.target.value); setQuote(null); }} className="rounded-md border border-border-subtle bg-surface p-3">{listing.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} — {number.format(unit.basePriceIrr)} {copy.currency}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><Input label={copy.checkIn} type="date" value={checkIn} onChange={(event) => { setCheckIn(event.target.value); setQuote(null); }} /><Input label={copy.checkOut} type="date" value={checkOut} onChange={(event) => { setCheckOut(event.target.value); setQuote(null); }} /></div>
      {selectedUnit ? <p className="text-metadata text-text-secondary">{selectedUnit.maxOccupancy ? `${selectedUnit.maxOccupancy} ${locale === "fa" ? "مهمان" : "guests"}` : ""}</p> : null}
      <Button variant="secondary" disabled={!unitId || !checkIn || !checkOut || isSubmitting} onClick={() => void refreshQuote()}>{copy.quote}</Button>
      {quote ? <div className="rounded-md bg-surface-subtle p-3"><p className={quote.isBookable ? "text-state-success" : "text-state-urgent"}>{quote.isBookable ? `${copy.total}: ${number.format(quote.totalAmountIrr)} ${copy.currency}` : copy.unavailable}</p></div> : null}
      {error ? <p className="text-metadata text-state-urgent">{error}</p> : null}
      <Button variant="primary" isLoading={isSubmitting} disabled={!quote?.isBookable} onClick={() => void submit()}>{copy.submit}</Button>
    </ContextSurface>}
  </div>;
}
