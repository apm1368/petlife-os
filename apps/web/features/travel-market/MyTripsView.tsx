"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { TravelBookingDto, TripListItemDto } from "@petlife/types";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { countryName } from "@/lib/number/format-number";
import { bookingStatusLabel, bookingStatusTone, stayDates } from "./labels";

const PHASE: Record<TripListItemDto["phase"], [string, string]> = {
  PLANNING: ["در حال برنامه‌ریزی", "Planning"],
  UPCOMING: ["پیش رو", "Upcoming"],
  IN_PROGRESS: ["در سفر", "Travelling"],
  COMPLETED: ["پایان یافته", "Completed"],
  CANCELLED: ["لغو شده", "Cancelled"],
};

/** TRIP HUB PATTERN — list. Trips and stay bookings in one place; upcoming first, history on its own tab. */
export function MyTripsView() {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [trips, setTrips] = useState<TripListItemDto[] | null>(null);
  const [stays, setStays] = useState<TravelBookingDto[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setTrips(null);
    setStays(null);
    setError(false);
    try {
      const [t, b] = await Promise.all([travelMarketService.trips(scope), travelMarketService.listBookings({ scope })]);
      setTrips(t);
      setStays(b.items.filter((x) => !x.tripId));
    } catch {
      setError(true);
    }
  }, [scope]);
  useEffect(() => void load(), [load]);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{fa ? "سفرهای من" : "My trips"}</h1>
        <Link href={`/${lang}/travel`} className="inline-flex min-h-11 items-center rounded-full bg-brand-natural px-5 font-bold text-text-inverse">{fa ? "جستجوی اقامت" : "Find a stay"}</Link>
      </div>
      <div role="tablist" aria-label={fa ? "بازه" : "Scope"} className="flex gap-2">
        {(["upcoming", "past"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={scope === s} onClick={() => setScope(s)} className={`min-h-11 rounded-full px-4 text-sm ${scope === s ? "bg-surface-subtle font-bold text-text-primary" : "text-text-secondary"}`}>{s === "upcoming" ? (fa ? "پیش رو" : "Upcoming") : fa ? "گذشته" : "Past"}</button>
        ))}
      </div>
      {error ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message={fa ? "دوباره تلاش کنید." : "Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void load()} /> : trips === null || stays === null ? (
        <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : trips.length === 0 && stays.length === 0 ? (
        <EmptyState title={scope === "upcoming" ? (fa ? "سفر پیش‌رویی ندارید" : "No upcoming trips") : fa ? "سفری در گذشته ندارید" : "No past trips"} description={fa ? "سفر را از پروفایل حیوان بسازید یا اقامتی رزرو کنید." : "Create a trip from your pet's profile, or book a stay."} />
      ) : (
        <>
          {trips.length ? (
            <section aria-labelledby="trips-h" className="flex flex-col gap-3">
              <h2 id="trips-h" className="text-section-title">{fa ? "سفرها" : "Trips"}</h2>
              <ul className="row-list">
                {trips.map((t) => (
                  <li key={t.id}>
                    <Link href={`/${lang}/travel/trips/${t.id}`} className="row-list__item row-list__item--stack">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-text-primary">{t.destinationCity ?? countryName(t.destinationCountry, lang)} · {t.petName}</span>
                        <StatusLabel tone={t.phase === "UPCOMING" || t.phase === "IN_PROGRESS" ? "success" : t.phase === "PLANNING" ? "attention" : "neutral"}>{PHASE[t.phase][fa ? 0 : 1]}</StatusLabel>
                      </div>
                      <span className="text-sm text-text-secondary">{formatDay(t.departAt.slice(0, 10), lang)}{t.returnAt ? ` — ${formatDay(t.returnAt.slice(0, 10), lang)}` : ""}</span>
                      <span className="text-metadata text-text-secondary">{fa ? `${localizeDigits(t.bookingCount, "fa")} اقامت · آمادگی ${localizeDigits(t.readyCount, "fa")} از ${localizeDigits(t.requirementCount, "fa")}` : `${t.bookingCount} stay${t.bookingCount === 1 ? "" : "s"} · ${t.readyCount} of ${t.requirementCount} requirements ready`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {stays.length ? (
            <section aria-labelledby="stays-h" className="flex flex-col gap-3">
              <h2 id="stays-h" className="text-section-title">{fa ? "اقامت‌های خارج از سفر" : "Stays not in a trip"}</h2>
              <ul className="row-list">
                {stays.map((b) => (
                  <li key={b.id}>
                    <Link href={`/${lang}/travel/bookings/${b.id}`} className="row-list__item row-list__item--stack">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{b.listingTitle}</span><StatusLabel tone={bookingStatusTone(b.status)}>{bookingStatusLabel(b.status, lang)}</StatusLabel></div>
                      <span className="text-sm text-text-secondary">{stayDates(b, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <p className="text-sm text-text-secondary">{fa ? "برای ساختن سفر تازه، به بخش سفر در پروفایل حیوان بروید: " : "To create a new trip, go to the travel tab of your pet's profile: "}<Link className="underline" href={`/${lang}/pets`}>{fa ? "حیوانات من" : "My pets"}</Link></p>
      <Button variant="ghost" className="w-fit" onClick={() => void load()}>{fa ? "به‌روزرسانی" : "Refresh"}</Button>
    </div>
  );
}
