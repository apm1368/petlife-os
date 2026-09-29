"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { TravelListingType, type TravelBookingDto, type TravelListingDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerTravelService } from "@/services/provider-travel.service";

const COPY = {
  en: { title: "Travel supply", subtitle: "Manage listings and respond to real travel requests from your active organization.", listings: "Listings", bookings: "Travel requests", emptyListings: "No travel listings have been created for this organization.", emptyBookings: "No travel booking requests yet.", submit: "Send for review", confirm: "Confirm", reject: "Decline", error: "Travel operations could not be loaded.", newListing: "Add travel listing", create: "Create draft", listingTitle: "Listing title", description: "Description", country: "Country", city: "City", unitName: "First unit name", nightlyPrice: "Base price (IRR)" },
  fa: { title: "عملیات سفر", subtitle: "فهرست‌ها و درخواست‌های واقعی سفرِ سازمان فعال را مدیریت کنید.", listings: "فهرست‌ها", bookings: "درخواست‌های سفر", emptyListings: "برای این سازمان هنوز فهرست سفری ایجاد نشده است.", emptyBookings: "هنوز درخواست رزرو سفر وجود ندارد.", submit: "ارسال برای بررسی", confirm: "تأیید", reject: "رد", error: "بارگذاری عملیات سفر ممکن نشد.", newListing: "افزودن فهرست سفر", create: "ساخت پیش‌نویس", listingTitle: "عنوان فهرست", description: "توضیحات", country: "کشور", city: "شهر", unitName: "نام اولین واحد", nightlyPrice: "قیمت پایه (ریال)" },
} as const;

const EMPTY_DRAFT = { type: TravelListingType.PET_FRIENDLY_HOTEL, title: "", description: "", country: "", city: "", unitName: "", basePriceIrr: "" };

export function ProviderTravelView() {
  const locale = useLocale() === "fa" ? "fa" : "en";
  const copy = COPY[locale];
  const [listings, setListings] = useState<TravelListingDto[] | null>(null);
  const [bookings, setBookings] = useState<TravelBookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  async function load(): Promise<void> {
    setError(null);
    try {
      const [listingResult, bookingResult] = await Promise.all([providerTravelService.listListings({ pageSize: 50 }), providerTravelService.listBookings({ pageSize: 50 })]);
      setListings(listingResult.items); setBookings(bookingResult.items);
    } catch (err) { setError(err instanceof ApiError ? err.message : copy.error); }
  }
  // The provider context is loaded once for this mounted workspace view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  async function act(key: string, operation: () => Promise<unknown>) {
    setActing(key); setError(null);
    try { await operation(); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : copy.error); } finally { setActing(null); }
  }
  async function createListing(): Promise<void> {
    if (!draft.title || !draft.description || !draft.country || !draft.city || !draft.unitName || !draft.basePriceIrr) return;
    await act("create", async () => {
      const listing = await providerTravelService.createListing({ type: draft.type, title: draft.title, description: draft.description, country: draft.country, city: draft.city });
      await providerTravelService.createUnit(listing.id, { name: draft.unitName, basePriceIrr: Number(draft.basePriceIrr) });
      setDraft(EMPTY_DRAFT); setShowCreate(false);
    });
  }
  if (error && !listings) return <ErrorRecovery title={copy.title} message={error} retryLabel={locale === "fa" ? "تلاش دوباره" : "Try again"} onRetry={load} />;
  if (!listings || !bookings) return <Skeleton className="h-64 w-full" aria-label={copy.title} />;
  return <div className="flex flex-col gap-6"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-page-title text-text-primary">{copy.title}</h1><p className="text-body text-text-secondary">{copy.subtitle}</p></div><Button variant="primary" onClick={() => setShowCreate((value) => !value)}>{copy.newListing}</Button></header>{error ? <p className="text-body text-state-urgent">{error}</p> : null}{showCreate ? <ContextSurface className="grid gap-3 md:grid-cols-2"><label className="flex flex-col gap-2 text-body text-text-primary">{locale === "fa" ? "نوع" : "Type"}<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as TravelListingType })} className="rounded-md border border-border-subtle bg-surface p-3">{Object.values(TravelListingType).map((type) => <option key={type} value={type}>{type}</option>)}</select></label><Input label={copy.listingTitle} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><label className="flex flex-col gap-2 text-body text-text-primary md:col-span-2">{copy.description}<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="min-h-28 rounded-md border border-border-subtle bg-surface p-3" /></label><Input label={copy.country} value={draft.country} onChange={(event) => setDraft({ ...draft, country: event.target.value })} /><Input label={copy.city} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /><Input label={copy.unitName} value={draft.unitName} onChange={(event) => setDraft({ ...draft, unitName: event.target.value })} /><Input label={copy.nightlyPrice} type="number" min="0" value={draft.basePriceIrr} onChange={(event) => setDraft({ ...draft, basePriceIrr: event.target.value })} /><Button variant="primary" isLoading={acting === "create"} disabled={!draft.title || draft.description.length < 20 || !draft.country || !draft.city || !draft.unitName || !draft.basePriceIrr} onClick={() => void createListing()}>{copy.create}</Button></ContextSurface> : null}<section className="space-y-3"><h2 className="text-section-title text-text-primary">{copy.listings}</h2>{listings.length === 0 ? <EmptyState title={copy.emptyListings} /> : <div className="grid gap-3 lg:grid-cols-2">{listings.map((listing) => <ContextSurface key={listing.id} className="space-y-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-body font-semibold text-text-primary">{listing.title}</h3><p className="text-metadata text-text-secondary">{listing.city} · {listing.units.length} {locale === "fa" ? "واحد" : "units"}</p></div><StatusLabel tone={listing.status === "PUBLISHED" ? "success" : "neutral"}>{listing.status}</StatusLabel></div>{listing.status === "DRAFT" || listing.status === "SUSPENDED" ? <Button variant="secondary" size="sm" isLoading={acting === listing.id} onClick={() => act(listing.id, () => providerTravelService.submitListing(listing.id))}>{copy.submit}</Button> : null}</ContextSurface>)}</div>}</section><section className="space-y-3"><h2 className="text-section-title text-text-primary">{copy.bookings}</h2>{bookings.length === 0 ? <EmptyState title={copy.emptyBookings} /> : <div className="flex flex-col gap-3">{bookings.map((booking) => <ContextSurface key={booking.id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-body font-semibold text-text-primary">{booking.reference} · {booking.listingTitle}</p><p className="text-metadata text-text-secondary">{booking.checkIn} — {booking.checkOut}</p></div><div className="flex items-center gap-2"><StatusLabel tone={booking.status === "CONFIRMED" ? "success" : "neutral"}>{booking.status}</StatusLabel>{booking.status === "AWAITING_PROVIDER" ? <><Button size="sm" variant="secondary" isLoading={acting === `${booking.id}-confirm`} onClick={() => act(`${booking.id}-confirm`, () => providerTravelService.respondToBooking(booking.id, "confirm"))}>{copy.confirm}</Button><Button size="sm" variant="ghost" isLoading={acting === `${booking.id}-reject`} onClick={() => act(`${booking.id}-reject`, () => providerTravelService.respondToBooking(booking.id, "reject"))}>{copy.reject}</Button></> : null}</div></ContextSurface>)}</div>}</section></div>;
}
