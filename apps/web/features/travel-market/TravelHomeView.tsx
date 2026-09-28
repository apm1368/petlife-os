"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { CalendarDays, HeartPulse, MapPin, ShieldCheck, Skeleton } from "@petlife/ui";
import type { TravelDestinationDto } from "@petlife/types";
import { localizeDigits } from "@/lib/date/jalali";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { useSessionStore } from "@/stores/session-store";
import { TravelSearchForm } from "./TravelSearchForm";

/**
 * TRAVEL DISCOVERY PATTERN — home. Search first; destinations are real listing counts from the
 * server (never a marketing list); the promise is explained plainly: PET LIFE shows what each
 * property itself states about pets, and says so when it states nothing.
 */
export function TravelHomeView() {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const session = useSessionStore((s) => s.status);
  const [destinations, setDestinations] = useState<TravelDestinationDto[] | null>(null);

  useEffect(() => {
    travelMarketService.destinations().then(setDestinations).catch(() => setDestinations([]));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 md:py-12">
      <header className="flex flex-col gap-3">
        <p className="text-metadata text-brand-natural">{fa ? "سفر با حیوان خانگی" : "Travel with your pet"}</p>
        <h1 className="text-page-title text-text-primary md:text-hero">{fa ? "اقامتی پیدا کنید که حیوان شما را هم می‌پذیرد" : "Find a stay that welcomes your pet too"}</h1>
        <p className="max-w-2xl text-body text-text-secondary">
          {fa
            ? "قوانین حیوانات هر اقامتگاه همان‌طور که خودش اعلام کرده نمایش داده می‌شود و با مشخصات حیوان شما مقایسه می‌شود. اگر چیزی اعلام نشده باشد، صریحاً می‌گوییم «اعلام نشده»."
            : "Each property's pet rules are shown exactly as the property stated them and compared with your pet's profile. When something is not stated, we say so."}
        </p>
      </header>

      <TravelSearchForm />

      <section aria-labelledby="dest-title" className="flex flex-col gap-4">
        <h2 id="dest-title" className="text-section-title text-text-primary">{fa ? "مقصدهای دارای اقامتگاه" : "Destinations with stays"}</h2>
        {destinations === null ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : destinations.length === 0 ? (
          <p className="text-body text-text-secondary">{fa ? "هنوز اقامتگاه منتشرشده‌ای وجود ندارد." : "No published stays yet."}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {destinations.slice(0, 12).map((d) => (
              <li key={`${d.country}-${d.city}`}>
                <Link href={`/${lang}/travel/search?city=${encodeURIComponent(d.city)}`} className="flex min-h-20 flex-col justify-center rounded-md border border-border-subtle bg-surface-elevated p-4 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  <span className="font-bold text-text-primary">{d.city}</span>
                  <span className="text-metadata text-text-secondary">{d.province ? `${d.province} · ` : ""}{fa ? `${localizeDigits(d.listingCount, "fa")} اقامتگاه` : `${d.listingCount} stay${d.listingCount === 1 ? "" : "s"}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-title" className="grid gap-4 md:grid-cols-3">
        <h2 id="how-title" className="sr-only">{fa ? "چطور کار می‌کند" : "How it works"}</h2>
        {[
          [ShieldCheck, fa ? "تطبیق با قوانین اعلام‌شده" : "Matched to stated rules", fa ? "گونه، تعداد و وزن حیوان شما با قوانین اعلام‌شدهٔ اقامتگاه مقایسه می‌شود: «مطابق»، «احتمال مغایرت» یا «اطلاعات بیشتری لازم است». این یک ضمانت ایمنی نیست." : "Species, number and weight are compared with the property's stated rules: fits, may not fit, or more information needed. It is not a safety guarantee."],
          [CalendarDays, fa ? "موجودی واقعی" : "Real availability", fa ? "تاریخ‌ها از تقویم خود اقامتگاه خوانده می‌شوند و هنگام رزرو برای ۱۵ دقیقه برای شما نگه داشته می‌شوند." : "Dates come from the property's own calendar and are held for you for 15 minutes while you book."],
          [HeartPulse, fa ? "آمادگی سفر" : "Trip readiness", fa ? "مدارک لازم سفر را در «سفرهای من» پیگیری کنید؛ منبع هر الزام کنار آن نوشته شده است." : "Track the documents your trip needs in My trips; every requirement shows where it came from."],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof ShieldCheck;
          return (
            <div key={title as string} className="flex flex-col gap-2 rounded-md border border-border-subtle p-4">
              <I aria-hidden className="h-6 w-6 text-brand-natural" />
              <h3 className="font-bold text-text-primary">{title as string}</h3>
              <p className="text-body text-text-secondary">{text as string}</p>
            </div>
          );
        })}
      </section>

      <nav aria-label={fa ? "پیوندهای مرتبط" : "Related"} className="flex flex-wrap gap-3">
        {session === "authenticated" ? <Link className="min-h-11 rounded-full border border-border-subtle px-4 py-2 text-sm" href={`/${lang}/travel/trips`}>{fa ? "سفرهای من" : "My trips"}</Link> : null}
        {session === "authenticated" ? <Link className="min-h-11 rounded-full border border-border-subtle px-4 py-2 text-sm" href={`/${lang}/travel/favorites`}>{fa ? "اقامتگاه‌های ذخیره‌شده" : "Saved stays"}</Link> : null}
        <Link className="min-h-11 rounded-full border border-border-subtle px-4 py-2 text-sm" href={`/${lang}/places`}><MapPin aria-hidden className="inline h-4 w-4" /> {fa ? "مکان‌های دوستدار حیوانات" : "Pet-friendly places"}</Link>
        <Link className="min-h-11 rounded-full border border-border-subtle px-4 py-2 text-sm" href={`/${lang}/insurance`}>{fa ? "بیمهٔ حیوانات" : "Pet insurance"}</Link>
      </nav>
    </div>
  );
}
