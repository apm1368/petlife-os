"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { TravelListingDto, TravelListingType } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { travelMarketplaceService } from "@/services/travel-marketplace.service";

const TYPES: TravelListingType[] = [
  "PET_FRIENDLY_HOTEL",
  "VILLA",
  "APARTMENT",
  "RESIDENCE",
  "BOARDING",
  "PET_TAXI",
  "INTERCITY_TRANSPORT",
  "AIRPORT_TRANSFER",
  "TRAVEL_SERVICE",
  "ATTRACTION",
  "CAFE_RESTAURANT",
  "VET_AT_DESTINATION",
] as TravelListingType[];

const COPY = {
  en: {
    title: "Travel with your pet",
    subtitle: "Find provider-listed stays, transport, and pet-friendly experiences with live availability.",
    city: "City",
    checkIn: "Check-in",
    checkOut: "Check-out",
    guests: "Guests",
    type: "Stay or service",
    all: "All travel options",
    search: "Search stays",
    empty: "No published travel listings match these filters yet.",
    from: "From",
    perStay: "per stay",
    perNight: "per night",
    verified: "Verified provider",
    details: "View stay",
    noPrice: "Price not yet set",
    error: "We could not load travel listings.",
    types: { PET_FRIENDLY_HOTEL: "Pet-friendly hotel", VILLA: "Villa", APARTMENT: "Apartment", RESIDENCE: "Residence", BOARDING: "Boarding", PET_TAXI: "Pet taxi", INTERCITY_TRANSPORT: "Intercity transport", AIRPORT_TRANSFER: "Airport transfer", TRAVEL_SERVICE: "Travel service", ATTRACTION: "Attraction", CAFE_RESTAURANT: "Café & restaurant", VET_AT_DESTINATION: "Vet at destination" },
  },
  fa: {
    title: "سفر با حیوان خانگی",
    subtitle: "اقامت، حمل‌ونقل و تجربه‌های دوستدار حیوانات را با ظرفیت واقعی پیدا کنید.",
    city: "شهر",
    checkIn: "تاریخ ورود",
    checkOut: "تاریخ خروج",
    guests: "تعداد مهمان",
    type: "نوع سفر یا خدمت",
    all: "همه گزینه‌ها",
    search: "جست‌وجوی اقامت",
    empty: "هنوز گزینهٔ منتشرشده‌ای با این فیلترها وجود ندارد.",
    from: "از",
    perStay: "برای کل سفر",
    perNight: "برای هر شب",
    verified: "ارائه‌دهنده تأییدشده",
    details: "مشاهده اقامت",
    noPrice: "قیمت هنوز ثبت نشده است",
    error: "بارگذاری گزینه‌های سفر ممکن نشد.",
    types: { PET_FRIENDLY_HOTEL: "هتل دوستدار حیوانات", VILLA: "ویلا", APARTMENT: "آپارتمان", RESIDENCE: "اقامتگاه", BOARDING: "پانسیون", PET_TAXI: "تاکسی حیوانات", INTERCITY_TRANSPORT: "حمل‌ونقل بین‌شهری", AIRPORT_TRANSFER: "ترانسفر فرودگاه", TRAVEL_SERVICE: "خدمت سفر", ATTRACTION: "جاذبه", CAFE_RESTAURANT: "کافه و رستوران", VET_AT_DESTINATION: "دامپزشک مقصد" },
  },
} as const;

export function TravelMarketplaceView() {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const copy = COPY[locale];
  const [city, setCity] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("1");
  const [type, setType] = useState<TravelListingType | "">("");
  const [listings, setListings] = useState<TravelListingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setError(null);
    try {
      const result = await travelMarketplaceService.search({
        pageSize: 48,
        city: city.trim() || undefined,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        guests: guests ? Number(guests) : undefined,
        type: type || undefined,
      });
      setListings(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.error);
    }
  }

  useEffect(() => {
    void load();
    // Initial public discovery should work before a household signs in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorRecovery title={copy.title} message={error} retryLabel={locale === "fa" ? "تلاش دوباره" : "Try again"} onRetry={load} />;

  return (
    <div className="flex flex-col gap-6">
      <header className="max-w-2xl space-y-2">
        <p className="text-metadata font-semibold text-brand-natural">PET LIFE TRAVEL</p>
        <h1 className="text-page-title text-text-primary">{copy.title}</h1>
        <p className="text-body text-text-secondary">{copy.subtitle}</p>
      </header>

      <ContextSurface className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Input label={copy.city} value={city} onChange={(event) => setCity(event.target.value)} />
        <Input label={copy.checkIn} type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
        <Input label={copy.checkOut} type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
        <Select label={copy.type} value={type} onChange={(event) => setType(event.target.value as TravelListingType | "")} options={[{ value: "", label: copy.all }, ...TYPES.map((value) => ({ value, label: copy.types[value] }))]} />
        <div className="flex items-end gap-2">
          <Input label={copy.guests} type="number" min="1" value={guests} onChange={(event) => setGuests(event.target.value)} />
          <Button variant="primary" onClick={load}>{copy.search}</Button>
        </div>
      </ContextSurface>

      {!listings ? <Skeleton className="h-64 w-full" aria-label={copy.title} /> : listings.length === 0 ? <EmptyState title={copy.empty} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => <TravelCard key={listing.id} listing={listing} locale={locale} />)}
        </div>
      )}
    </div>
  );
}

function TravelCard({ listing, locale }: { listing: TravelListingDto; locale: "fa" | "en" }) {
  const copy = COPY[locale];
  const price = listing.fromPriceIrr === null ? copy.noPrice : new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(listing.fromPriceIrr);
  return (
    <ContextSurface className="flex h-full flex-col gap-4 overflow-hidden">
      {listing.imageUrls[0] ? <img src={listing.imageUrls[0]} alt="" className="h-40 w-full rounded-md object-cover" /> : <div className="flex h-40 items-end rounded-md bg-brand-mint p-4 text-section-title text-brand-natural">{copy.types[listing.type]}</div>}
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-section-title text-text-primary">{listing.title}</h2>
            <p className="text-metadata text-text-secondary">{listing.city}, {listing.country}</p>
          </div>
          {listing.isVerified ? <StatusLabel tone="success">{copy.verified}</StatusLabel> : null}
        </div>
        <p className="line-clamp-2 text-body text-text-secondary">{listing.description}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <p className="text-body font-semibold text-text-primary">{listing.fromPriceIrr === null ? price : <>{copy.from} {price} <span className="text-metadata font-normal text-text-secondary">{listing.pricingMode === "PER_TRIP" ? copy.perStay : copy.perNight}</span></>}</p>
          <Link href={`/travel/${listing.id}`}><Button variant="secondary" size="sm">{copy.details}</Button></Link>
        </div>
      </div>
    </ContextSurface>
  );
}
