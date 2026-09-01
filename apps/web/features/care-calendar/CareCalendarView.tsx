"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { CareCalendarEventDto } from "@petlife/types";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import { careCalendarService } from "@/services/care-calendar.service";

/**
 * Deliberately minimal — a scannable list of upcoming Care Calendar events,
 * not the full calendar product. Booking remains the editable source of
 * truth; clicking through opens the real Booking Detail screen.
 */
export function CareCalendarView() {
  const t = useTranslations("careCalendar");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [events, setEvents] = useState<CareCalendarEventDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setEvents(await careCalendarService.list());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (error) return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!events) return <Skeleton className="h-48 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {events.length === 0 ? <EmptyState title={t("empty")} /> : null}

      {events.map((event) => (
        <button key={event.id} type="button" className="w-full text-start" onClick={() => router.push(`/${locale}/bookings/${event.bookingId}`)}>
          <ContextSurface className="flex items-center justify-between gap-3">
            <div>
              <p className="text-body text-text-primary">{t(`event.${event.type}`)}</p>
              <p className="text-metadata text-text-secondary">{formatAppointmentDateTime(event.startAt, locale, event.timezone)}</p>
            </div>
            <StatusLabel tone={event.status === "SCHEDULED" ? "success" : "neutral"}>{t(`status.${event.status}`)}</StatusLabel>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}
