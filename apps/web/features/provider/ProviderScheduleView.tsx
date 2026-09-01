"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { ProviderBookingSummaryDto } from "@petlife/types";
import { providerOsService } from "@/services/provider-os.service";
import { formatDayLabel } from "@/lib/date/appointment-date";
import { ProviderBookingRow } from "./ProviderBookingRow";

type ScheduleTab = "today" | "agenda" | "week";
const TABS: ScheduleTab[] = ["today", "agenda", "week"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function groupByDay(bookings: ProviderBookingSummaryDto[], locale: "fa" | "en"): [string, ProviderBookingSummaryDto[]][] {
  const groups = new Map<string, ProviderBookingSummaryDto[]>();
  for (const booking of bookings) {
    const key = formatDayLabel(booking.startAt, locale, booking.timezone);
    groups.set(key, [...(groups.get(key) ?? []), booking]);
  }
  return Array.from(groups.entries());
}

/**
 * Provider Schedule (spec sections 27-29) — Today/Agenda/Week views built
 * directly from existing bookings + availability rules, no new calendar
 * engine and no drag/drop.
 */
export function ProviderScheduleView() {
  const t = useTranslations("provider.schedule");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [tab, setTab] = useState<ScheduleTab>("today");
  const [bookings, setBookings] = useState<ProviderBookingSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setBookings(null);
    try {
      if (tab === "today") {
        setBookings(await providerOsService.listBookings({ today: true }));
      } else {
        const upcoming = await providerOsService.listBookings({ upcoming: true });
        if (tab === "week") {
          const now = Date.now();
          setBookings(upcoming.filter((b) => new Date(b.startAt).getTime() < now + WEEK_MS));
        } else {
          setBookings(upcoming);
        }
      }
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;

  const grouped = bookings ? groupByDay(bookings, locale) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <div className="flex gap-1">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              "rounded-full px-3 py-1.5 text-metadata " + (tab === key ? "bg-surface-subtle text-text-primary" : "text-text-secondary")
            }
          >
            {t(`tab.${key}`)}
          </button>
        ))}
      </div>

      {!bookings ? <Skeleton className="h-64 w-full" aria-label={t("loading")} /> : null}
      {bookings && bookings.length === 0 ? <EmptyState title={t("empty")} /> : null}
      {grouped.map(([day, dayBookings]) => (
        <div key={day} className="flex flex-col gap-2">
          <p className="text-metadata font-medium text-text-secondary">{day}</p>
          {dayBookings.map((booking) => (
            <ProviderBookingRow key={booking.id} booking={booking} locale={locale} onClick={() => router.push(`/${locale}/provider/bookings/${booking.id}`)} />
          ))}
        </div>
      ))}
    </div>
  );
}
