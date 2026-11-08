"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@petlife/ui";
import { careTitle } from "@/features/care/care-labels";
import { LoadFailure } from "@/features/system/LoadFailure";
import { formatCount } from "@/lib/number/format-number";
import { careRemindersService } from "@/services/care-reminders.service";
import { careCalendarService } from "@/services/care-calendar.service";
import { calendarMonth, careDayKey } from "./care-calendar-date";
import { HealthCareFrame } from "@/features/health/HealthCareFrame";

type CalendarEvent = { id: string; title: string; date: string; status: string; href: string; source: string };
const DAY_MS = 86_400_000;
const TEHRAN = "Asia/Tehran";

export function PetCareCalendarView({ petId, toolbar }: { petId: string; toolbar?: ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("careCalendar");
  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale;
  const [anchor, setAnchor] = useState(() => new Date());
  const [mode, setMode] = useState<"MONTH" | "AGENDA">("MONTH");
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [reminders, bookings] = await Promise.all([
        careRemindersService.list(petId),
        careCalendarService.list(petId),
      ]);
      setEvents([
        ...reminders.map((reminder) => ({
          id: reminder.id,
          title: careTitle(reminder, locale),
          date: reminder.dueAt,
          status: reminder.state,
          href: `/${locale}/pets/${petId}/care/${reminder.id}`,
          source: reminder.source,
        })),
        ...bookings.map((booking) => ({
          id: booking.id,
          title: t("bookingTitle"),
          date: booking.startAt,
          status: booking.status,
          href: `/${locale}/bookings/${booking.bookingId}`,
          source: "BOOKING_DERIVED",
        })),
      ].sort((left, right) => left.date.localeCompare(right.date)));
    } catch (loadError) {
      setError(loadError);
    }
  }, [locale, petId, t]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!events) return <Skeleton className="h-72 w-full" aria-label={t("loading")} />;

  const month = calendarMonth(anchor, locale);
  const monthLabel = new Intl.DateTimeFormat(dateLocale, {
    year: "numeric", month: "long", timeZone: TEHRAN,
  }).format(anchor);
  const weekdayStart = new Date(month.first.getTime() - month.offset * DAY_MS);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(dateLocale, { weekday: "short", timeZone: TEHRAN })
      .format(new Date(weekdayStart.getTime() + index * DAY_MS)),
  );
  const monthKeys = new Set(month.dates.map(careDayKey));
  const visible = events.filter((event) => selected
    ? careDayKey(event.date) === selected
    : monthKeys.has(careDayKey(event.date)));
  const todayKey = careDayKey(new Date());

  return (
    <HealthCareFrame>
      <div className="flex flex-col gap-5">
        <header className="section-head">
          <div>
            <h1>{t("title")}</h1>
            <p>{t("subtitle")}</p>
          </div>
          <Link className="btn-quiet" href={`/${locale}/pets/${petId}/care`}>{t("careCenter")}</Link>
        </header>

        <div className="calendar-toolbar">
          {toolbar}
          <div className="calendar-toolbar__month">
            <Button variant="secondary" size="sm" onClick={() => { setAnchor(month.previous); setSelected(null); }}>
              {t("previous")}
            </Button>
            <h2 className="section-title" style={{ margin: 0 }}>{monthLabel}</h2>
            <Button variant="secondary" size="sm" onClick={() => { setAnchor(month.next); setSelected(null); }}>
              {t("next")}
            </Button>
          </div>
          <div className="calendar-toolbar__views" role="group" aria-label={t("viewLabel")}>
            <button type="button" aria-pressed={mode === "MONTH"} onClick={() => setMode("MONTH")}>
              {t("month")}
            </button>
            <button type="button" aria-pressed={mode === "AGENDA"} onClick={() => setMode("AGENDA")}>
              {t("agenda")}
            </button>
          </div>
        </div>

        <label className="md:hidden">
          {t("selectDay")}
          <select className="mt-1 block w-full rounded border p-3" value={selected ?? ""} onChange={(event) => setSelected(event.target.value || null)}>
            <option value="">{t("allDaysThisMonth")}</option>
            {month.dates.map((date) => (
              <option key={careDayKey(date)} value={careDayKey(date)}>
                {new Intl.DateTimeFormat(dateLocale, { day: "numeric", weekday: "long", timeZone: TEHRAN }).format(date)}
              </option>
            ))}
          </select>
        </label>

        {mode === "MONTH" ? (
          <div className="hidden grid-cols-7 overflow-hidden rounded-xl border border-border-subtle md:grid">
            {weekdays.map((weekday) => <div key={weekday} className="bg-surface-subtle p-3 text-center text-sm">{weekday}</div>)}
            {Array.from({ length: month.offset }, (_, index) => <div key={`empty-${index}`} className="border border-border-subtle" />)}
            {month.dates.map((date) => {
              const dayKey = careDayKey(date);
              const dayEvents = events.filter((event) => careDayKey(event.date) === dayKey);
              return (
                <div key={dayKey} className="cal-day" data-today={dayKey === todayKey || undefined} data-selected={dayKey === selected || undefined}>
                  <button type="button" className="cal-day__num" aria-current={dayKey === todayKey ? "date" : undefined} onClick={() => setSelected(dayKey)}>
                    {new Intl.DateTimeFormat(dateLocale, { day: "numeric", timeZone: TEHRAN }).format(date)}
                  </button>
                  {dayEvents.slice(0, 3).map((event) => (
                    <Link key={event.id} href={event.href} className="cal-chip" data-status={event.status} data-source={event.source}>
                      {event.title}
                    </Link>
                  ))}
                  {dayEvents.length > 3 ? (
                    <button type="button" className="cal-more" onClick={() => setSelected(dayKey)}>
                      +{formatCount(dayEvents.length - 3, locale)}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {selected ? <Button variant="ghost" onClick={() => setSelected(null)}>{t("showWholeMonth")}</Button> : null}
        <section aria-label={t("eventAgenda")} className="divide-y divide-border-subtle">
          {!visible.length ? <EmptyState title={t("emptyRange")} /> : visible.map((event) => (
            <Link key={event.id} href={event.href} className="cal-agenda-row" data-status={event.status} data-source={event.source}>
              <span className="font-bold text-text-primary">{event.title}</span>
              <time dateTime={event.date} className="text-sm text-text-secondary">
                {new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: TEHRAN }).format(new Date(event.date))}
              </time>
            </Link>
          ))}
        </section>
      </div>
    </HealthCareFrame>
  );
}
