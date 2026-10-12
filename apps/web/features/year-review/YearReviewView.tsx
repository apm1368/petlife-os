"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, Skeleton } from "@petlife/ui";
import { PetLifecycleStatus, type PetDto, type PetYearReviewDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { petYearReviewService } from "@/services/pet-year-review.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { CARE_KINDS } from "@/features/care/care-labels";
import { petAgeMonths } from "@/features/pets/pet-identity";
import { formatDay, localizeDigits, todayIso } from "@/lib/date/jalali";
import { currentYear, systemFor, yearRange, type Locale } from "@/features/expenses/expense-model";
import { humanYears, nextBirthday } from "./birthday";

const SERVICE_LABELS: Record<string, [string, string]> = {
  VET: ["ویزیت دامپزشک", "Vet visits"],
  GROOMING: ["آرایش و نظافت", "Grooming"],
  TRAINING: ["آموزش", "Training"],
  WALKING: ["پیاده‌روی", "Walks"],
  SITTING: ["نگهداری در خانه", "Pet sitting"],
  BOARDING: ["پانسیون", "Boarding"],
  PET_TAXI: ["تاکسی حیوان", "Pet taxi"],
  OTHER: ["سایر خدمات", "Other services"],
};

const copy = {
  fa: {
    title: (name: string, year: string) => `سال ${year} با ${name}`,
    memorialTitle: (name: string, year: string) => `یاد ${name} در سال ${year}`,
    intro: "خلاصه‌ای از آنچه امسال برای این حیوان ثبت شده است؛ فقط از داده‌های واقعی پرونده.",
    prevYear: "سال قبل",
    nextYear: "سال بعد",
    memories: "خاطره",
    photos: "عکس",
    care: "مراقبت انجام‌شده",
    services: "خدمت دریافت‌شده",
    trips: "سفر",
    visits: "ویزیت دامپزشکی",
    highlights: "لحظه‌های ماندگار",
    mostCare: "بیشترین مراقبت‌ها",
    servicesBreakdown: "خدمات",
    destinations: "مقصدها",
    birthday: "تولد",
    birthdayToday: (name: string, n: string) => `امروز تولد ${n} سالگی ${name} است!`,
    birthdayIn: (days: string, n: string) => `${days} روز تا تولد ${n} سالگی`,
    humanAge: (n: string) => `حدوداً ${n} سال انسانی`,
    humanNote: "تخمین رایج؛ برای سگ‌ها میانگین اندازه‌ی متوسط در نظر گرفته شده است.",
    noBirthDate: "تاریخ تولد ثبت نشده است؛ با ثبت آن، شمارش معکوس تولد اینجا نمایش داده می‌شود.",
    addBirthDate: "ثبت تاریخ تولد",
    empty: "هنوز چیزی برای این سال ثبت نشده است. با افزودن خاطره، مراقبت یا سفر، مرور سال شکل می‌گیرد.",
    addMemory: "افزودن خاطره",
    loading: "در حال آماده‌سازی مرور سال",
  },
  en: {
    title: (name: string, year: string) => `${year} with ${name}`,
    memorialTitle: (name: string, year: string) => `Remembering ${name} in ${year}`,
    intro: "A recap of what was recorded for this pet this year — built only from the real record.",
    prevYear: "Previous year",
    nextYear: "Next year",
    memories: "memories",
    photos: "photos",
    care: "care tasks done",
    services: "services received",
    trips: "trips",
    visits: "vet visits",
    highlights: "Highlights",
    mostCare: "Most frequent care",
    servicesBreakdown: "Services",
    destinations: "Destinations",
    birthday: "Birthday",
    birthdayToday: (name: string, n: string) => `${name} turns ${n} today!`,
    birthdayIn: (days: string, n: string) => `${days} days until turning ${n}`,
    humanAge: (n: string) => `About ${n} in human years`,
    humanNote: "A common estimate; dogs use a medium-size average.",
    noBirthDate: "No birth date recorded; add one to see a birthday countdown here.",
    addBirthDate: "Add birth date",
    empty: "Nothing recorded for this year yet. Memories, care and trips will build this recap.",
    addMemory: "Add a memory",
    loading: "Preparing the year in review",
  },
} as const;

export function YearReviewView({ petId }: { petId: string }) {
  const locale = (useLocale() === "fa" ? "fa" : "en") as Locale;
  const c = copy[locale];
  const system = systemFor(locale);
  const today = todayIso();
  const thisYear = currentYear(system, today);
  const [year, setYear] = useState(thisYear);
  const [pet, setPet] = useState<PetDto | null>(null);
  const [review, setReview] = useState<PetYearReviewDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const range = useMemo(() => yearRange(system, year), [system, year]);

  const load = useCallback(async () => {
    setError(null);
    setReview(null);
    try {
      const [petData, reviewData] = await Promise.all([petsService.getById(petId), petYearReviewService.get(petId, range.from, range.to)]);
      setPet(petData);
      setReview(reviewData);
    } catch (err) {
      setError(err);
    }
  }, [petId, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!pet || !review) return <Skeleton className="h-80 w-full" aria-label={c.loading} />;

  const n = (value: number) => localizeDigits(value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US"), locale);
  const isMemorial = pet.lifecycleStatus === PetLifecycleStatus.DECEASED || pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;
  const yearLabel = localizeDigits(year, locale);
  const base = `/${locale}/pets/${petId}`;

  const stats: { value: number; label: string }[] = [
    { value: review.memories.total, label: c.memories },
    { value: review.memories.photos, label: c.photos },
    ...(review.care ? [{ value: review.care.completed, label: c.care }] : []),
    ...(review.services ? [{ value: review.services.completed, label: c.services }] : []),
    ...(review.health ? [{ value: review.health.visits, label: c.visits }] : []),
    ...(review.trips ? [{ value: review.trips.count, label: c.trips }] : []),
  ];
  const isEmpty = stats.every((s) => s.value === 0);
  const birthday = !isMemorial && pet.birthDate ? nextBirthday(pet.birthDate.slice(0, 10), today) : null;
  const human = humanYears(pet.species, petAgeMonths(pet));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-section-title text-text-primary">{(isMemorial ? c.memorialTitle : c.title)(pet.name, yearLabel)}</h1>
          <p className="mt-1 text-sm leading-7 text-text-secondary">{c.intro}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setYear((y) => y - 1)} aria-label={c.prevYear}>{locale === "fa" ? "›" : "‹"}</Button>
          <span className="min-w-16 text-center font-semibold text-text-primary" aria-live="polite">{yearLabel}</span>
          <Button variant="ghost" size="sm" onClick={() => setYear((y) => y + 1)} aria-label={c.nextYear} disabled={year >= thisYear}>{locale === "fa" ? "‹" : "›"}</Button>
        </div>
      </header>

      {!isMemorial && year === thisYear ? (
        <section aria-label={c.birthday} className="split-panel flex flex-wrap items-center justify-between gap-3">
          {birthday ? (
            <p className="text-lg font-semibold text-text-primary">
              {birthday.daysUntil === 0 ? c.birthdayToday(pet.name, localizeDigits(birthday.turning, locale)) : c.birthdayIn(n(birthday.daysUntil), localizeDigits(birthday.turning, locale))}
              <span className="block text-sm font-normal text-text-secondary">{formatDay(birthday.nextIso, locale, { weekday: true })}</span>
            </p>
          ) : (
            <p className="text-sm text-text-secondary">{c.noBirthDate} <Link className="underline" href={`${base}?edit=identity`}>{c.addBirthDate}</Link></p>
          )}
          {human !== null ? (
            <p className="text-sm text-text-secondary" title={c.humanNote}>{c.humanAge(n(human))}</p>
          ) : null}
        </section>
      ) : null}

      {isEmpty ? (
        <div className="split-panel flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">{c.empty}</p>
          <Link className="btn-quiet" href={`${base}/memories/new`}>{c.addMemory}</Link>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <li key={stat.label} className="split-panel text-center">
                <p className="text-3xl font-bold text-text-primary">{n(stat.value)}</p>
                <p className="mt-1 text-sm text-text-secondary">{stat.label}</p>
              </li>
            ))}
          </ul>

          <div className="grid gap-6 lg:grid-cols-2">
            {review.memories.highlights.length ? (
              <section aria-labelledby="yr-highlights" className="split-panel">
                <h2 id="yr-highlights" className="mb-3 font-semibold text-text-primary">{c.highlights}</h2>
                <ul className="flex flex-col gap-2">
                  {review.memories.highlights.map((h) => (
                    <li key={h.id}>
                      <Link className="font-medium text-text-primary underline-offset-4 hover:underline" href={`${base}/memories/${h.id}`}>{h.title}</Link>
                      <span className="block text-xs text-text-secondary">{formatDay(h.occurredAt.slice(0, 10), locale)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {review.care && review.care.topTypes.length ? (
              <section aria-labelledby="yr-care" className="split-panel">
                <h2 id="yr-care" className="mb-3 font-semibold text-text-primary">{c.mostCare}</h2>
                <Breakdown rows={review.care.topTypes.map((t) => [CARE_KINDS[t.type]?.[locale === "fa" ? 0 : 1] ?? t.type, t.count])} n={n} />
              </section>
            ) : null}
            {review.services && review.services.byCategory.length ? (
              <section aria-labelledby="yr-services" className="split-panel">
                <h2 id="yr-services" className="mb-3 font-semibold text-text-primary">{c.servicesBreakdown}</h2>
                <Breakdown rows={review.services.byCategory.map((s) => [SERVICE_LABELS[s.category]?.[locale === "fa" ? 0 : 1] ?? s.category, s.count])} n={n} />
              </section>
            ) : null}
            {review.trips && review.trips.destinations.length ? (
              <section aria-labelledby="yr-trips" className="split-panel">
                <h2 id="yr-trips" className="mb-3 font-semibold text-text-primary">{c.destinations}</h2>
                <p className="text-text-primary">{review.trips.destinations.join(locale === "fa" ? "، " : ", ")}</p>
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function Breakdown({ rows, n }: { rows: [string, number][]; n: (value: number) => string }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map(([label, count]) => (
        <li key={label} className="flex justify-between gap-3">
          <span className="text-text-primary">{label}</span>
          <span className="font-semibold text-text-primary">{n(count)}</span>
        </li>
      ))}
    </ul>
  );
}
