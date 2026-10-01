"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@petlife/ui";
import { servicesService } from "@/services/services.service";
import { formatDateKey } from "@/lib/date/appointment-date";
import { addDays, calendarFromIso, localizeDigits, monthName, weekday, WEEKDAYS_EN_SHORT, WEEKDAYS_FA } from "@/lib/date/jalali";
import { formatCount } from "@/lib/number/format-number";

const DAYS = 7;

interface Props {
  serviceId: string;
  locationId: string;
  /** First day shown (ISO day key, Tehran calendar). */
  start: string;
  locale: "fa" | "en";
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

  if (failed) return <p className="week-avail__note">{fa ? "زمان‌های آزاد این هفته بارگیری نشد؛ در مرحلهٔ رزرو روز را انتخاب کنید." : "This week's openings could not load; choose a day while booking."}</p>;

  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  return (
    <ol className="week-avail" aria-label={fa ? "زمان‌های آزاد هفت روز آینده" : "Openings over the next seven days"} aria-busy={counts === null}>
      {days.map((day) => {
        const n = counts?.[day] ?? 0;
        const c = calendarFromIso(fa ? "jalali" : "gregorian", day);
        const label = (
          <>
            <span className="week-avail__wd">{fa ? WEEKDAYS_FA[weekday(day)] : WEEKDAYS_EN_SHORT[weekday(day)]}</span>
            <span className="week-avail__day">{localizeDigits(c.day, locale)} <small>{monthName(fa ? "jalali" : "gregorian", c.month, locale)}</small></span>
            <span className="week-avail__n">{counts === null ? <Skeleton className="h-3 w-10" /> : n ? (fa ? `${formatCount(n, "fa")} زمان` : `${n} ${n === 1 ? "time" : "times"}`) : fa ? "پر" : "Full"}</span>
          </>
        );
        const state = counts === null ? "loading" : n ? "open" : "full";
        const aria = counts === null ? undefined : n ? (fa ? `${formatCount(n, "fa")} زمان آزاد` : `${n} open times`) : fa ? "زمان آزاد ندارد" : "No open times";
        return (
          <li key={day} data-state={state} data-selected={selected === day || undefined}>
            {state === "open" && hrefFor ? (
              <Link href={hrefFor(day)} aria-label={`${fa ? WEEKDAYS_FA[weekday(day)] : WEEKDAYS_EN_SHORT[weekday(day)]} ${localizeDigits(c.day, locale)} ${monthName(fa ? "jalali" : "gregorian", c.month, locale)} — ${aria}`}>{label}</Link>
            ) : onSelect ? (
              <button type="button" disabled={state !== "open"} aria-pressed={selected === day} aria-label={aria ? `${fa ? WEEKDAYS_FA[weekday(day)] : WEEKDAYS_EN_SHORT[weekday(day)]} ${localizeDigits(c.day, locale)} ${monthName(fa ? "jalali" : "gregorian", c.month, locale)} — ${aria}` : undefined} onClick={() => onSelect(day)}>{label}</button>
            ) : (
              <span aria-label={aria}>{label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
