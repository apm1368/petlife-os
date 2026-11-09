"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@petlife/ui";
import { servicesService } from "@/services/services.service";
import { formatDateKey } from "@/lib/date/appointment-date";
import { addDays, calendarFromIso, localizeDigits, monthName, weekday, WEEKDAYS_FA } from "@/lib/date/jalali";
import { useTranslations } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";

const DAYS = 7;

interface Props {
  serviceId: string;
  locationId: string;
  /** First day shown (ISO day key, Tehran calendar). */
  start: string;
  locale: RouteLocale;
  variantId?: string | null;
  providerUserId?: string | null;
  petId?: string;
  selected?: string;
  /** Either choose a day in place (booking flow) or link to the booking flow (provider page). */
  onSelect?: (day: string) => void;
  hrefFor?: (day: string) => string;
}

/**
 * Seven days of real openings for one service: each day shows how many distinct start times the
 * server reports as available, and a day without any is shown as full — never as open. The counts
 * come from the same availability endpoint the time step uses, so nothing here is estimated.
 */
export function WeekAvailability({ serviceId, locationId, start, locale, variantId, providerUserId, petId, selected, onSelect, hrefFor }: Props) {
  const fa = locale === "fa";
  const t = useTranslations("providerProfile.availability");
  const dateLocale = locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-GB";
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setCounts(null);
    setFailed(false);
    const from = new Date(`${start}T00:00:00+03:30`);
    const to = new Date(from.getTime() + DAYS * 86400_000);
    void servicesService
      .getAvailability(serviceId, { locationId, from: (from < new Date() ? new Date() : from).toISOString(), to: to.toISOString(), variantId: variantId ?? undefined, providerUserId: providerUserId ?? undefined, petId })
      .then((res) => {
        if (!live) return;
        const byDay: Record<string, Set<string>> = {};
        for (const slot of res.slots) {
          if (slot.state !== "AVAILABLE") continue;
          const key = formatDateKey(slot.startAt, slot.timezone);
          (byDay[key] ??= new Set()).add(slot.startAt);
        }
        setCounts(Object.fromEntries(Object.entries(byDay).map(([k, v]) => [k, v.size])));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [serviceId, locationId, start, variantId, providerUserId, petId]);

  if (failed) return <p className="week-avail__note">{t("loadFailed")}</p>;

  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  return (
    <ol className="week-avail" aria-label={t("weekLabel")} aria-busy={counts === null}>
      {days.map((day) => {
        const n = counts?.[day] ?? 0;
        const c = fa ? calendarFromIso("jalali", day) : null;
        const date = new Date(`${day}T12:00:00Z`);
        const weekdayLabel = fa ? WEEKDAYS_FA[weekday(day)] : new Intl.DateTimeFormat(dateLocale, { weekday: "short", timeZone: "UTC" }).format(date);
        const dayLabel = fa ? localizeDigits(c!.day, "fa") : new Intl.NumberFormat(dateLocale).format(date.getUTCDate());
        const monthLabel = fa ? monthName("jalali", c!.month, "fa") : new Intl.DateTimeFormat(dateLocale, { month: "short", timeZone: "UTC" }).format(date);
        const label = (
          <>
            <span className="week-avail__wd">{weekdayLabel}</span>
            <span className="week-avail__day">{dayLabel} <small>{monthLabel}</small></span>
            <span className="week-avail__n">{counts === null ? <Skeleton className="h-3 w-10" /> : n ? t("availableTimes", { count: n }) : t("full")}</span>
          </>
        );
        const state = counts === null ? "loading" : n ? "open" : "full";
        const aria = counts === null ? undefined : n ? t("openTimes", { count: n }) : t("noOpenTimes");
        return (
          <li key={day} data-state={state} data-selected={selected === day || undefined}>
            {state === "open" && hrefFor ? (
              <Link href={hrefFor(day)} aria-label={`${weekdayLabel} ${dayLabel} ${monthLabel} — ${aria}`}>{label}</Link>
            ) : onSelect ? (
              <button type="button" disabled={state !== "open"} aria-pressed={selected === day} aria-label={aria ? `${weekdayLabel} ${dayLabel} ${monthLabel} — ${aria}` : undefined} onClick={() => onSelect(day)}>{label}</button>
            ) : (
              <span aria-label={aria}>{label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
