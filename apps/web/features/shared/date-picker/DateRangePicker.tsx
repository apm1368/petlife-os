"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Button, ChevronLeft, ChevronRight, Sheet, CalendarDays, cn } from "@petlife/ui";
import {
  addDays,
  addMonths,
  calendarFromIso,
  daysBetween,
  firstDayOfWeek,
  formatDay,
  localizeDigits,
  monthGrid,
  monthName,
  todayIso,
  WEEKDAYS_EN_SHORT,
  WEEKDAYS_FA_SHORT,
  type CalendarSystem,
} from "@/lib/date/jalali";

export interface DateRangeValue {
  start: string | null;
  end: string | null;
}

export interface DateRangePickerProps {
  /** "range" picks check-in + check-out; "single" picks one day (end stays null). */
  mode?: "range" | "single";
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Earliest selectable ISO day (inclusive). Defaults to today in Tehran. */
  min?: string;
  /** Latest selectable ISO day (inclusive). */
  max?: string;
  /**
   * A day that cannot be *occupied* (sold out / blocked night). It cannot start a stay and no
   * stay may span it, but it can still be the check-out day because that night is not used.
   */
  isUnavailable?: (iso: string) => boolean;
  minNights?: number;
  maxNights?: number;
  /** 2 on wide screens by default; the second month hides below the `md` breakpoint. */
  months?: 1 | 2;
  /** Defaults to Jalali in Persian and Gregorian in English. */
  system?: CalendarSystem;
  /** Lets a Persian reader flip to the Gregorian calendar (and back). */
  allowSystemToggle?: boolean;
  className?: string;
}

type Lang = "fa" | "en";

/**
 * Reusable Jalali / Gregorian date (range) picker — the canonical date control.
 *
 * Values are always ISO day keys; the calendar system is presentation only.
 * Accessible as an ARIA grid: arrow keys move by day/week (mirrored in RTL),
 * PageUp/PageDown by month, Home/End to the week edges, Enter/Space selects.
 * Disabled days carry the reason in their label, never only a colour.
 */
export function DateRangePicker({
  mode = "range",
  value,
  onChange,
  min,
  max,
  isUnavailable,
  minNights = 1,
  maxNights = 30,
  months = 2,
  system: systemProp,
  allowSystemToggle = true,
  className,
}: DateRangePickerProps) {
  const lang = useLocale() as Lang;
  const fa = lang === "fa";
  const [system, setSystem] = useState<CalendarSystem>(systemProp ?? (fa ? "jalali" : "gregorian"));
  const today = useMemo(() => todayIso(), []);
  const floor = min ?? today;
  const anchorIso = value.start ?? floor;
  const [view, setView] = useState(() => {
    const c = calendarFromIso(system, anchorIso);
    return { year: c.year, month: c.month };
  });
  const [focused, setFocused] = useState<string>(anchorIso);
  const [hovered, setHovered] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState("");

  useEffect(() => {
    const c = calendarFromIso(system, focused);
    setView((v) => {
      const second = addMonths(v.year, v.month, 1);
      const visible = (c.year === v.year && c.month === v.month) || (months === 2 && c.year === second.year && c.month === second.month);
      return visible ? v : { year: c.year, month: c.month };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, system]);

  const choosingEnd = mode === "range" && !!value.start && !value.end;

  /** Why a day cannot be chosen right now, or null. */
  const blockReason = useCallback(
    (iso: string): string | null => {
      if (iso < floor) return fa ? "گذشته یا خارج از بازه" : "Past or outside the allowed range";
      if (max && iso > max) return fa ? "خارج از بازهٔ مجاز" : "Outside the allowed range";
      if (choosingEnd && value.start && iso > value.start) {
        const nights = daysBetween(value.start, iso);
        if (nights < minNights) return fa ? `حداقل ${localizeDigits(minNights, "fa")} شب` : `Minimum ${minNights} nights`;
        if (nights > maxNights) return fa ? `حداکثر ${localizeDigits(maxNights, "fa")} شب` : `Maximum ${maxNights} nights`;
        for (let d = value.start; d < iso; d = addDays(d, 1)) {
          if (isUnavailable?.(d)) return fa ? "بازه شامل شب ناموجود است" : "The stay would include an unavailable night";
        }
        return null;
      }
      if (isUnavailable?.(iso)) return fa ? "ناموجود" : "Unavailable";
      return null;
    },
    [floor, max, choosingEnd, value.start, minNights, maxNights, isUnavailable, fa],
  );

  const select = (iso: string) => {
    if (blockReason(iso)) return;
    if (mode === "single") {
      onChange({ start: iso, end: null });
      setLive(formatDay(iso, lang, { system, weekday: true }));
      return;
    }
    if (choosingEnd && value.start && iso > value.start) {
      onChange({ start: value.start, end: iso });
      const nights = daysBetween(value.start, iso);
      setLive(fa ? `خروج ${formatDay(iso, lang, { system })}، ${localizeDigits(nights, "fa")} شب` : `Check-out ${formatDay(iso, lang, { system })}, ${nights} nights`);
      return;
    }
    onChange({ start: iso, end: null });
    setLive(fa ? `ورود ${formatDay(iso, lang, { system })}؛ روز خروج را انتخاب کنید` : `Check-in ${formatDay(iso, lang, { system })}; now choose check-out`);
  };

  const move = (days: number) => {
    const next = addDays(focused, days);
    setFocused(next);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${next}"]`)?.focus());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const forward = fa ? -1 : 1; // ArrowRight goes back in time in RTL.
    const wd = (new Date(`${focused}T12:00:00Z`).getUTCDay() - firstDayOfWeek(system) + 7) % 7;
    const c = calendarFromIso(system, focused);
    switch (e.key) {
      case "ArrowRight": move(forward); break;
      case "ArrowLeft": move(-forward); break;
      case "ArrowDown": move(7); break;
      case "ArrowUp": move(-7); break;
      case "Home": move(-wd); break;
      case "End": move(6 - wd); break;
      case "PageDown":
      case "PageUp": {
        const t = addMonths(c.year, c.month, e.key === "PageDown" ? 1 : -1);
        const next = monthGrid(system, t.year, t.month).filter((x) => x.inMonth);
        move(daysBetween(focused, (next[Math.min(c.day, next.length) - 1] ?? next[0]!).iso));
        break;
      }
      case "Enter":
      case " ": select(focused); break;
      default: return;
    }
    e.preventDefault();
  };

  const rangeEnd = value.end ?? (choosingEnd && hovered && hovered > (value.start ?? "") && !blockReason(hovered) ? hovered : null);
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => (fa ? WEEKDAYS_FA_SHORT : WEEKDAYS_EN_SHORT)[(firstDayOfWeek(system) + i) % 7]!);
  const panels = months === 2 ? [view, addMonths(view.year, view.month, 1)] : [view];
  const canGoBack = (() => {
    const prev = addMonths(view.year, view.month, -1);
    const lastOfPrev = monthGrid(system, prev.year, prev.month).filter((x) => x.inMonth).pop()!;
    return lastOfPrev.iso >= floor;
  })();

  const shiftView = (delta: number) => {
    const t = addMonths(view.year, view.month, delta);
    setView(t);
    const first = monthGrid(system, t.year, t.month).find((x) => x.inMonth)!.iso;
    setFocused(first < floor ? floor : first);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)} dir={fa ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => shiftView(-1)} disabled={!canGoBack} aria-label={fa ? "ماه قبل" : "Previous month"} className="min-h-11 min-w-11 rounded-full border border-border-subtle p-2 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          {fa ? <ChevronRight aria-hidden className="mx-auto h-5 w-5" /> : <ChevronLeft aria-hidden className="mx-auto h-5 w-5" />}
        </button>
        {allowSystemToggle && fa ? (
          <div role="group" aria-label={fa ? "تقویم" : "Calendar"} className="flex rounded-full border border-border-subtle p-0.5 text-metadata">
            {(["jalali", "gregorian"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={system === s} onClick={() => setSystem(s)} className={cn("min-h-9 rounded-full px-3", system === s ? "bg-brand-natural text-text-inverse" : "text-text-secondary")}>
                {s === "jalali" ? "شمسی" : "میلادی"}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" onClick={() => shiftView(1)} disabled={!!max && monthGrid(system, addMonths(view.year, view.month, months).year, addMonths(view.year, view.month, months).month)[0]!.iso > max} aria-label={fa ? "ماه بعد" : "Next month"} className="min-h-11 min-w-11 rounded-full border border-border-subtle p-2 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          {fa ? <ChevronLeft aria-hidden className="mx-auto h-5 w-5" /> : <ChevronRight aria-hidden className="mx-auto h-5 w-5" />}
        </button>
      </div>

      <div ref={gridRef} className="grid gap-6 md:grid-cols-2" onKeyDown={onKeyDown} onMouseLeave={() => setHovered(null)}>
        {panels.map((p, index) => {
          const cells = monthGrid(system, p.year, p.month);
          const title = `${monthName(system, p.month, lang)} ${localizeDigits(p.year, lang)}`;
          return (
            <div key={`${p.year}-${p.month}`} className={cn(index === 1 && "hidden md:block")}>
              <h3 className="mb-2 text-center font-bold text-text-primary" id={`dp-${p.year}-${p.month}`}>{title}</h3>
              <div role="grid" aria-labelledby={`dp-${p.year}-${p.month}`} className="grid grid-cols-7 gap-y-1 text-center">
                <div role="row" className="contents">
                  {weekdayLabels.map((w, i) => (
                    <div role="columnheader" key={i} className="py-1 text-metadata text-text-secondary">{w}</div>
                  ))}
                </div>
                {Array.from({ length: 6 }, (_, row) => (
                  <div role="row" key={row} className="contents">
                    {cells.slice(row * 7, row * 7 + 7).map((cell) => {
                      if (!cell.inMonth) return <div role="gridcell" key={cell.iso} aria-hidden className="h-11" />;
                      const reason = blockReason(cell.iso);
                      const isStart = cell.iso === value.start;
                      const isEnd = cell.iso === value.end;
                      const inRange = !!value.start && !!rangeEnd && cell.iso > value.start && cell.iso < rangeEnd;
                      const isToday = cell.iso === today;
                      const label = `${formatDay(cell.iso, lang, { system, weekday: true })}${isStart ? (fa ? "، ورود" : ", check-in") : ""}${isEnd ? (fa ? "، خروج" : ", check-out") : ""}${reason ? `، ${reason}` : ""}`;
                      return (
                        <div role="gridcell" key={cell.iso} aria-selected={isStart || isEnd || inRange} className={cn("relative h-11", inRange && "bg-brand-natural/10", isStart && value.end && (fa ? "rounded-r-full bg-brand-natural/10" : "rounded-l-full bg-brand-natural/10"), isEnd && (fa ? "rounded-l-full bg-brand-natural/10" : "rounded-r-full bg-brand-natural/10"))}>
                          <button
                            type="button"
                            data-iso={cell.iso}
                            tabIndex={cell.iso === focused ? 0 : -1}
                            aria-label={label}
                            aria-disabled={reason ? true : undefined}
                            onClick={() => { setFocused(cell.iso); select(cell.iso); }}
                            onMouseEnter={() => setHovered(cell.iso)}
                            onFocus={() => setFocused(cell.iso)}
                            className={cn(
                              "mx-auto flex h-11 w-11 items-center justify-center rounded-full text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                              reason ? "cursor-not-allowed text-text-disabled line-through decoration-1" : "text-text-primary hover:bg-surface-subtle",
                              (isStart || isEnd) && "bg-brand-natural font-bold text-text-inverse no-underline hover:bg-brand-natural",
                              isToday && !isStart && !isEnd && "ring-1 ring-inset ring-border-strong",
                            )}
                          >
                            {localizeDigits(cell.day, lang)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">{live}</p>
    </div>
  );
}

/** "۶ مهر — ۸ مهر ۱۴۰۵ · ۲ شب" style summary for a chosen range. */
export function formatStayRange(value: DateRangeValue, lang: Lang, system?: CalendarSystem): string | null {
  if (!value.start) return null;
  if (!value.end) return formatDay(value.start, lang, { system });
  const nights = daysBetween(value.start, value.end);
  const n = lang === "fa" ? `${localizeDigits(nights, "fa")} شب` : `${nights} night${nights === 1 ? "" : "s"}`;
  return `${formatDay(value.start, lang, { system, year: false })} — ${formatDay(value.end, lang, { system })}${lang === "fa" ? "، " : " · "}${n}`;
}

export interface DateRangeFieldProps extends Omit<DateRangePickerProps, "className"> {
  label: string;
  placeholder?: string;
  id?: string;
  error?: string | null;
  /** Called when the sheet is confirmed (not on every click). Defaults to onChange. */
  className?: string;
}

/**
 * Trigger + sheet. The chosen range is committed only on "Apply" so a half-picked range never
 * reaches a search or a quote; "Clear" empties it. Bottom sheet on phones, side panel on desktop.
 */
export function DateRangeField({ label, placeholder, id: idProp, error, className, value, onChange, mode = "range", ...picker }: DateRangeFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const lang = useLocale() as Lang;
  const fa = lang === "fa";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  const summary = formatStayRange(value, lang);
  const complete = mode === "single" ? !!draft.start : !!draft.start && !!draft.end;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm font-medium text-text-primary" id={`${id}-label`}>{label}</span>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label ${id}`}
        onClick={() => setOpen(true)}
        className={cn("flex min-h-12 items-center gap-2 rounded-md border bg-surface-base px-3 text-start text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]", error ? "border-state-urgent" : "border-border-subtle")}
      >
        <CalendarDays aria-hidden className="h-5 w-5 shrink-0 text-text-secondary" />
        <span className={summary ? "" : "text-text-secondary"}>{summary ?? placeholder ?? (fa ? "انتخاب تاریخ" : "Choose dates")}</span>
      </button>
      {error ? <span className="text-metadata text-state-urgent" role="alert">{error}</span> : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={label} className="sm:max-w-3xl">
        <DateRangePicker {...picker} mode={mode} value={draft} onChange={setDraft} />
        <p className="mt-3 text-sm text-text-secondary" aria-live="polite">
          {formatStayRange(draft, lang) ?? (mode === "range" ? (fa ? "روز ورود را انتخاب کنید." : "Choose your check-in day.") : fa ? "روز را انتخاب کنید." : "Choose a day.")}
          {mode === "range" && draft.start && !draft.end ? (fa ? " اکنون روز خروج را انتخاب کنید." : " Now choose check-out.") : ""}
        </p>
        <div className="sticky bottom-0 mt-4 flex gap-3 bg-surface-elevated pt-2">
          <Button type="button" variant="ghost" onClick={() => { onChange({ start: null, end: null }); setOpen(false); }}>{fa ? "پاک کردن" : "Clear"}</Button>
          <Button type="button" className="flex-1" disabled={!complete} onClick={() => { onChange(draft); setOpen(false); }}>{fa ? "تأیید تاریخ" : "Apply dates"}</Button>
        </div>
      </Sheet>
    </div>
  );
}
