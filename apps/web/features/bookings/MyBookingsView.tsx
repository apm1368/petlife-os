"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { BookingDto, PetDto } from "@petlife/types";
import { formatDateTimeRange } from "@/lib/date/appointment-date";
import { bookingsService, type WaitlistEntry } from "@/services/bookings.service";
import { householdsService } from "@/services/households.service";
import { bookingStatusLabel, bookingStatusTone, categoryLabel } from "@/features/discovery/labels";

type Tab = "upcoming" | "requested" | "past" | "cancelled" | "waitlist";
const TABS: { key: Tab; fa: string; en: string }[] = [
  { key: "upcoming", fa: "پیش رو", en: "Upcoming" },
  { key: "requested", fa: "درخواست‌ها و پرداخت", en: "Requested" },
  { key: "past", fa: "انجام‌شده", en: "Completed" },
  { key: "cancelled", fa: "لغو و منقضی", en: "Cancelled" },
  { key: "waitlist", fa: "لیست انتظار", en: "Waitlist" },
];

/** One list for every category — vet and marketplace bookings are the same Booking entity. */
export function MyBookingsView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "upcoming") as Tab;
  const petId = params.get("petId") ?? "";
  const [bookings, setBookings] = useState<BookingDto[] | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[] | null>(null);
  const [pets, setPets] = useState<PetDto[]>([]);
  const [error, setError] = useState(false);

  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const load = useCallback(async () => {
    setError(false);
    setBookings(null);
    setWaitlist(null);
    try {
      if (tab === "waitlist") setWaitlist(await bookingsService.listWaitlist());
      else setBookings(await bookingsService.list({ [tab]: true, petId: petId || undefined }));
    } catch {
      setError(true);
    }
  }, [tab, petId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    void householdsService
      .listMine()
      .then((hh) => Promise.all(hh.map((h) => householdsService.listPets(h.id))))
      .then((lists) => setPets(lists.flat()))
      .catch(() => setPets([]));
  }, []);

  async function leaveWaitlist(id: string) {
    await bookingsService.cancelWaitlist(id);
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{fa ? "نوبت‌های من" : "My bookings"}</h1>
        <Link href={`/${locale}/services`} className="text-sm font-bold text-brand-natural">{fa ? "رزرو خدمت تازه" : "Book a service"}</Link>
      </header>
      <nav aria-label={fa ? "دسته نوبت‌ها" : "Booking tabs"} className="-mx-1 flex gap-2 overflow-x-auto border-b border-border-subtle pb-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setParam({ tab: t.key })} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${tab === t.key ? "bg-brand-solid text-on-brand" : "text-text-secondary"}`}>
            {fa ? t.fa : t.en}
          </button>
        ))}
      </nav>
      {tab !== "waitlist" && pets.length > 1 ? (
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="text-text-secondary">{fa ? "حیوان" : "Pet"}</span>
          <select className="rounded border border-border-subtle bg-surface-base p-2" value={petId} onChange={(e) => setParam({ petId: e.target.value || undefined })}>
            <option value="">{fa ? "همه" : "All pets"}</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? <ErrorRecovery title={fa ? "نوبت‌ها بارگیری نشد" : "Bookings could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} /> : null}

      {tab === "waitlist" ? (
        !waitlist && !error ? (
          <Skeleton className="h-40 w-full" />
        ) : waitlist?.length === 0 ? (
          <EmptyState title={fa ? "در هیچ لیست انتظاری نیستید" : "You are not on any waitlist"} description={fa ? "وقتی روزی پر است، می‌توانید از صفحه رزرو به لیست انتظار بپیوندید." : "When a day is full you can join its waitlist from the booking page."} />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {waitlist?.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-bold">{w.serviceName} · {w.providerName}</p>
                  <p className="text-sm text-text-secondary">{w.petName} · {formatDateTimeRange(w.windowStart, w.windowEnd, locale, "Asia/Tehran")}</p>
                  <p className="text-sm">{w.status === "NOTIFIED" ? (fa ? "زمانی آزاد شد؛ برای رزرو اقدام کنید (برایتان نگه داشته نشده است)." : "A time opened — book it (it is not held for you).") : w.status === "ACTIVE" ? (fa ? "در انتظار" : "Waiting") : w.status === "BOOKED" ? (fa ? "رزرو شد" : "Booked") : fa ? "بسته شد" : "Closed"}</p>
                </div>
                <div className="flex gap-2">
                  {w.status === "NOTIFIED" ? (
                    <Link className="rounded-md bg-brand-solid px-3 py-2 text-sm text-on-brand" href={`/${locale}/providers/${w.providerOrganizationId}/book?serviceId=${w.serviceId}${w.variantId ? `&variantId=${w.variantId}` : ""}&date=${w.windowStart.slice(0, 10)}`}>
                      {fa ? "رزرو" : "Book"}
                    </Link>
                  ) : null}
                  {w.status === "ACTIVE" || w.status === "NOTIFIED" ? (
                    <Button variant="ghost" size="sm" onClick={() => void leaveWaitlist(w.id)}>{fa ? "خروج از لیست" : "Leave"}</Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : !error && !bookings ? (
        <Skeleton className="h-48 w-full" aria-label={fa ? "در حال بارگیری" : "Loading"} />
      ) : bookings?.length === 0 ? (
        <EmptyState
          title={fa ? "نوبتی در این بخش نیست" : "No bookings here"}
          actionLabel={tab === "upcoming" ? (fa ? "پیدا کردن خدمت" : "Find a service") : undefined}
          onAction={tab === "upcoming" ? () => router.push(`/${locale}/services`) : undefined}
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {bookings?.map((b) => (
            <li key={b.id}>
              <Link href={`/${locale}/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-bold text-text-primary">{b.serviceName ?? b.service?.name ?? categoryLabel(b.category, fa)}{b.variantName ? ` — ${b.variantName}` : ""}</p>
                  <p className="text-sm text-text-secondary">{b.provider?.name}{b.bookingNumber ? <> · <span dir="ltr">{b.bookingNumber}</span></> : null}</p>
                  <p className="text-sm text-text-secondary">{formatDateTimeRange(b.startAt, b.endAt, locale, b.timezone)}</p>
                </div>
                <StatusLabel tone={bookingStatusTone(b.bookingStatus)}>{bookingStatusLabel(b.bookingStatus, fa)}</StatusLabel>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
