"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { BookingDto } from "@petlife/types";
import { formatDateTimeRange } from "@/lib/date/appointment-date";
import { bookingsService } from "@/services/bookings.service";

type Tab = "upcoming" | "past" | "cancelled";

/**
 * A consumer's bookings across every pet and category, one list with
 * category differentiation (spec section 41) rather than a per-category
 * screen. Vet and marketplace bookings share this exact same list — they
 * are the same Booking entity underneath.
 */
export function MyBookingsView() {
  const t = useTranslations("bookings.myBookings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [tab, setTab] = useState<Tab>("upcoming");
  const [bookings, setBookings] = useState<BookingDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load(activeTab: Tab) {
    setError(false);
    setBookings(null);
    try {
      setBookings(await bookingsService.list({ [activeTab]: true }));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load(tab);
  }, [tab]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div className="flex gap-2">
        {(["upcoming", "past", "cancelled"] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`rounded-md border px-3 py-2 text-metadata ${
              tab === tabKey ? "border-brand-mint bg-brand-mint/10 text-text-primary" : "border-border-subtle text-text-secondary"
            }`}
          >
            {t(`tab.${tabKey}`)}
          </button>
        ))}
      </div>

      {error ? <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={() => load(tab)} /> : null}
      {!error && !bookings ? <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} /> : null}
      {!error && bookings && bookings.length === 0 ? <EmptyState title={t(`empty.${tab}`)} /> : null}

      {bookings?.map((booking) => (
        <button key={booking.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/bookings/${booking.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body font-medium text-text-primary">{booking.service?.name ?? t(`category.${booking.category}`)}</p>
              <p className="text-metadata text-text-secondary">{booking.provider?.name}</p>
              <p className="text-metadata text-text-secondary">{formatDateTimeRange(booking.startAt, booking.endAt, locale, booking.timezone)}</p>
            </div>
            <StatusLabel tone={booking.bookingStatus.startsWith("CANCELLED") ? "attention" : booking.bookingStatus === "CONFIRMED" ? "success" : "neutral"}>
              {t(`status.${booking.bookingStatus}`)}
            </StatusLabel>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
