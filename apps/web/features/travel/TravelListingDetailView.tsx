"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { TravelListingDto, TravelQuoteDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { travelMarketplaceService } from "@/services/travel-marketplace.service";

const COPY = {
  en: { back: "All travel options", verified: "Verified provider", policy: "Pet policy", facilities: "Amenities", units: "Available units", checkIn: "Check-in", checkOut: "Check-out", quote: "Check live price", choosePet: "Choose a pet to book", noPolicy: "The provider has not added a detailed pet policy.", policyNote: "Provider policy — confirm any points that matter to your pet before booking.", unavailable: "Not available for these dates", available: "Available for these dates", total: "Estimated total", error: "We could not load this listing.", currency: "IRR" },
  fa: { back: "همه گزینه‌های سفر", verified: "ارائه‌دهنده تأییدشده", policy: "قوانین حیوانات", facilities: "امکانات", units: "واحدهای قابل رزرو", checkIn: "تاریخ ورود", checkOut: "تاریخ خروج", quote: "بررسی قیمت و ظرفیت", choosePet: "انتخاب حیوان برای رزرو", noPolicy: "ارائه‌دهنده هنوز قوانین کامل حیوانات را ثبت نکرده است.", policyNote: "این اطلاعات توسط ارائه‌دهنده ثبت شده است؛ موارد مهم برای حیوانتان را پیش از رزرو تأیید کنید.", unavailable: "برای این تاریخ‌ها ظرفیت ندارد", available: "برای این تاریخ‌ها قابل رزرو است", total: "مجموع برآوردی", error: "بارگذاری این گزینه ممکن نشد.", currency: "ریال" },
} as const;

export function TravelListingDetailView({ listingId }: { listingId: string }) {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const copy = COPY[locale];
  const [listing, setListing] = useState<TravelListingDto | null>(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [quote, setQuote] = useState<TravelQuoteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);

  async function load(): Promise<void> {
    setError(null);
    try {
      const result = await travelMarketplaceService.getListing(listingId);
      setListing(result);
      setSelectedUnitId((current) => current || result.units[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.error);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [listingId]);

  async function requestQuote(): Promise<void> {
    if (!selectedUnitId || !checkIn || !checkOut) return;
    setIsQuoting(true); setError(null);
    try { setQuote(await travelMarketplaceService.quote(listingId, { unitId: selectedUnitId, checkIn, checkOut, petCount: 1 })); }
    catch (err) { setError(err instanceof ApiError ? err.message : copy.error); }
    finally { setIsQuoting(false); }
  }

  if (error && !listing) return <ErrorRecovery title={copy.error} message={error} retryLabel={locale === "fa" ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!listing) return <Skeleton className="h-72 w-full" aria-label={copy.error} />;
  const format = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US");

  return <div className="flex flex-col gap-6">
    <Link href="/travel" className="w-fit text-body text-brand-natural">← {copy.back}</Link>
    <header className="grid gap-5 lg:grid-cols-[1.3fr,1fr]">
      {listing.imageUrls[0] ? <img src={listing.imageUrls[0]} alt={listing.title} className="h-72 w-full rounded-lg object-cover" /> : <div className="flex h-72 items-end rounded-lg bg-brand-mint p-6 text-page-title text-brand-natural">{listing.city}</div>}
      <div className="flex flex-col justify-center gap-3">
        <div className="flex items-center gap-2">{listing.isVerified ? <StatusLabel tone="success">{copy.verified}</StatusLabel> : null}</div>
        <h1 className="text-page-title text-text-primary">{listing.title}</h1>
        <p className="text-body text-text-secondary">{listing.address ?? `${listing.city}, ${listing.country}`}</p>
        <p className="text-body text-text-secondary">{listing.description}</p>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
      <div className="flex flex-col gap-5">
        <ContextSurface className="space-y-3"><h2 className="text-section-title text-text-primary">{copy.facilities}</h2><p className="text-body text-text-secondary">{listing.amenities.length ? listing.amenities.join(" · ") : "—"}</p></ContextSurface>
        <ContextSurface className="space-y-3"><h2 className="text-section-title text-text-primary">{copy.policy}</h2><p className="text-body text-text-secondary">{copy.policyNote}</p>{listing.petPolicy ? <ul className="space-y-1 text-body text-text-secondary"><li>{listing.petPolicy.dogsAllowed ? "✓" : "—"} {locale === "fa" ? "پذیرش سگ" : "Dogs accepted"}</li><li>{listing.petPolicy.catsAllowed ? "✓" : "—"} {locale === "fa" ? "پذیرش گربه" : "Cats accepted"}</li>{listing.petPolicy.maxPets !== null ? <li>{locale === "fa" ? `حداکثر ${listing.petPolicy.maxPets} حیوان` : `Up to ${listing.petPolicy.maxPets} pets`}</li> : null}{listing.petPolicy.notes ? <li>{listing.petPolicy.notes}</li> : null}</ul> : <p className="text-body text-text-secondary">{copy.noPolicy}</p>}</ContextSurface>
      </div>
      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{copy.units}</h2>
        {listing.units.map((unit) => <label key={unit.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border-subtle p-3"><input type="radio" name="unit" checked={selectedUnitId === unit.id} onChange={() => { setSelectedUnitId(unit.id); setQuote(null); }} /><span className="flex-1"><strong className="text-body text-text-primary">{unit.name}</strong><span className="block text-metadata text-text-secondary">{unit.maxOccupancy ? `${unit.maxOccupancy} ${locale === "fa" ? "مهمان" : "guests"}` : ""}</span></span><span className="text-metadata text-text-secondary">{format.format(unit.basePriceIrr)} {copy.currency}</span></label>)}
        <div className="grid grid-cols-2 gap-2"><Input label={copy.checkIn} type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /><Input label={copy.checkOut} type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></div>
        <Button variant="primary" isLoading={isQuoting} disabled={!selectedUnitId || !checkIn || !checkOut} onClick={requestQuote}>{copy.quote}</Button>
        {quote ? <div className="rounded-md bg-surface-subtle p-3 text-body text-text-primary">{quote.isBookable ? <><p className="text-state-success">{copy.available}</p><p>{copy.total}: {format.format(quote.totalAmountIrr)} {copy.currency}</p><Link href="/pets"><Button className="mt-3" variant="secondary">{copy.choosePet}</Button></Link></> : <p className="text-state-urgent">{copy.unavailable}</p>}</div> : null}
        {error ? <p className="text-metadata text-state-urgent">{error}</p> : null}
      </ContextSurface>
    </div>
  </div>;
}
