"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Button, Dialog, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { ProviderAvailabilityExceptionDto, ProviderBookingSummaryDto } from "@petlife/types";
import { providerOsService, type ProviderStaffMember } from "@/services/provider-os.service";
import { bookingStatusLabel } from "@/features/discovery/labels";
import { DateReading } from "@/lib/date/date-reading";
import { apiErrorText } from "@/lib/errors/api-error-text";

type View = "day" | "week" | "month";
const DAY_MS = 86400_000;
const CLOSED = new Set(["CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER", "REJECTED", "EXPIRED", "RESCHEDULED"]);
const STATUS_CLASS: Record<string, string> = {
  REQUESTED: "border-state-attention bg-state-attention/10",
  AWAITING_PAYMENT: "border-state-attention bg-state-attention/10",
  CONFIRMED: "border-brand-natural bg-brand-natural/10",
  CHECKED_IN: "border-brand-natural bg-brand-natural/20",
  IN_PROGRESS: "border-brand-natural bg-brand-natural/30",
  COMPLETED: "border-border-subtle bg-surface-subtle",
  NO_SHOW: "border-state-urgent bg-state-urgent/10",
};

/** Local calendar key in the provider's timezone, so a 23:30 booking never lands on the wrong day. */
function localKey(iso: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(key: string, days: number): string {
  return new Date(new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * OPERATIONAL CALENDAR PATTERN: Day / Week / Month over real bookings and blocked periods, filtered
 * by staff. Each entry shows status by label and border (never colour alone) and opens the booking.
 * Below `md` every view renders as an agenda list — the desktop grid is never squeezed onto a phone.
 */
export function ProviderCalendarView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [view, setView] = useState<View>("week");
  const [timeZone, setTimeZone] = useState("Asia/Tehran");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => localKey(new Date(), "Asia/Tehran"));
  const [staffId, setStaffId] = useState<string>("");
  const [staff, setStaff] = useState<ProviderStaffMember[]>([]);
  const [bookings, setBookings] = useState<ProviderBookingSummaryDto[] | null>(null);
  const [blocks, setBlocks] = useState<ProviderAvailabilityExceptionDto[]>([]);
  const [error, setError] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [block, setBlock] = useState({ date: "", start: "09:00", end: "10:00", reason: "", staff: "" });
  const [blockError, setBlockError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => {
    if (view === "day") return { start: anchor, days: 1 };
    if (view === "week") {
      // Weeks start Saturday in fa (Iranian convention) and Monday in en.
      const dow = new Date(`${anchor}T12:00:00Z`).getUTCDay();
      const offset = fa ? (dow + 1) % 7 : (dow + 6) % 7;
      return { start: addDays(anchor, -offset), days: 7 };
    }
    const first = `${anchor.slice(0, 8)}01`;
    const next = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10);
    return { start: first, days: Math.round((new Date(next).getTime() - new Date(first).getTime()) / DAY_MS) };
  }, [view, anchor, fa]);
  const dayKeys = useMemo(() => Array.from({ length: range.days }, (_, i) => addDays(range.start, i)), [range]);

  const load = useCallback(async () => {
    setError(false);
    setBookings(null);
    try {
      const from = new Date(new Date(`${range.start}T00:00:00Z`).getTime() - DAY_MS).toISOString();
      const to = new Date(new Date(`${range.start}T00:00:00Z`).getTime() + (range.days + 1) * DAY_MS).toISOString();
      const [rows, exceptions] = await Promise.all([providerOsService.listBookings({ from, to, providerUserId: staffId || undefined }), providerOsService.listAvailabilityExceptions()]);
      setBookings(rows.filter((b) => !CLOSED.has(b.bookingStatus)));
      setBlocks(exceptions.filter((e) => e.type === "BLOCKED" && (!staffId || !e.providerUserId || e.providerUserId === staffId)));
    } catch {
      setError(true);
    }
  }, [range, staffId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    void providerOsService.listStaff().then(setStaff).catch(() => setStaff([]));
    void providerOsService
      .getOverview()
      .then((o) => {
        if (o.location) {
          setTimeZone(o.location.timezone);
          setLocationId(o.location.id);
          setAnchor(localKey(new Date(), o.location.timezone));
        }
      })
      .catch(() => undefined);
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, ProviderBookingSummaryDto[]>();
    for (const b of bookings ?? []) map.set(localKey(b.startAt, timeZone), [...(map.get(localKey(b.startAt, timeZone)) ?? []), b]);
    for (const list of map.values()) list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
  }, [bookings, timeZone]);
  const blocksByDay = useMemo(() => {
    const map = new Map<string, ProviderAvailabilityExceptionDto[]>();
    for (const e of blocks) for (let k = localKey(e.startAt, timeZone); k <= localKey(e.endAt, timeZone); k = addDays(k, 1)) map.set(k, [...(map.get(k) ?? []), e]);
    return map;
  }, [blocks, timeZone]);

  const time = (iso: string) => new Intl.DateTimeFormat(fa ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
  const dayTitle = (key: string, long = false) => new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));
  const periodTitle = new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", view === "month" ? { month: "long", year: "numeric" } : { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${range.start}T12:00:00Z`));
  const staffName = (id: string | null) => staff.find((s) => s.providerUserId === id)?.displayName ?? (fa ? "همه" : "Everyone");

  async function saveBlock() {
    if (!locationId || !block.date) return;
    setBusy(true);
    setBlockError(null);
    try {
      // The provider's own calendar day and times, interpreted in the location timezone by the API rules.
      const toIso = (t: string) => new Date(new Date(`${block.date}T${t}:00Z`).getTime() - tzOffsetMs(block.date, timeZone)).toISOString();
      await providerOsService.createAvailabilityException({ locationId, providerUserId: block.staff || undefined, startAt: toIso(block.start), endAt: toIso(block.end), type: "BLOCKED" as never, reason: block.reason || undefined });
      setBlockOpen(false);
      await load();
    } catch (e) {
      setBlockError(apiErrorText(e, locale, fa ? "ثبت نشد" : "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  const entry = (b: ProviderBookingSummaryDto) => (
    <Link key={b.id} href={`/${locale}/provider/bookings/${b.id}`} className={`block rounded border-s-4 px-2 py-1 text-xs ${STATUS_CLASS[b.bookingStatus] ?? "border-border-subtle"}`}>
      <span className="font-bold">{time(b.startAt)}</span> {b.petName} · {b.serviceName}
      <span className="block text-text-secondary">{bookingStatusLabel(b.bookingStatus, fa)}{b.providerUserId && !staffId ? ` · ${staffName(b.providerUserId)}` : ""}</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title">{fa ? "تقویم کاری" : "Operations calendar"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={fa ? "کارشناس" : "Staff"} className="rounded border border-border-subtle bg-surface-base p-2 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{fa ? "همه کارشناسان" : "All staff"}</option>
            {staff.map((s) => <option key={s.providerUserId} value={s.providerUserId}>{s.displayName}</option>)}
          </select>
          <Button variant="secondary" size="sm" disabled={!locationId} onClick={() => { setBlock((b) => ({ ...b, date: anchor, staff: staffId })); setBlockOpen(true); }}>{fa ? "مسدود کردن زمان" : "Block time"}</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="group" aria-label={fa ? "نمای تقویم" : "Calendar view"}>
          {(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-brand-natural text-white" : "text-text-secondary"}`}>
              {v === "day" ? (fa ? "روز" : "Day") : v === "week" ? (fa ? "هفته" : "Week") : fa ? "ماه" : "Month"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label={fa ? "قبلی" : "Previous"} onClick={() => setAnchor(view === "month" ? addDays(range.start, -1) : addDays(anchor, -range.days))}>{fa ? "›" : "‹"}</Button>
          <span className="min-w-40 text-center text-sm font-bold" aria-live="polite">{periodTitle}</span>
          <Button variant="ghost" size="sm" aria-label={fa ? "بعدی" : "Next"} onClick={() => setAnchor(view === "month" ? addDays(range.start, range.days) : addDays(anchor, range.days))}>{fa ? "‹" : "›"}</Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(localKey(new Date(), timeZone))}>{fa ? "امروز" : "Today"}</Button>
        </div>
      </div>

      {error ? <ErrorRecovery title={fa ? "تقویم بارگیری نشد" : "Calendar could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} /> : null}
      {!error && !bookings ? <Skeleton className="h-96 w-full" /> : null}

      {bookings ? (
        <>
          {/* Desktop grid */}
          <div className={`hidden md:grid ${view === "day" ? "grid-cols-1" : "grid-cols-7"} gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle`}>
            {view === "month"
              ? Array.from({ length: (new Date(`${range.start}T12:00:00Z`).getUTCDay() + (fa ? 1 : 6)) % 7 }, (_, i) => <div key={`pad-${i}`} className="bg-surface-subtle" />)
              : null}
            {dayKeys.map((key) => {
              const items = byDay.get(key) ?? [];
              const dayBlocks = blocksByDay.get(key) ?? [];
              return (
                <section key={key} aria-label={dayTitle(key, true)} className={`flex flex-col gap-1 bg-surface-base p-2 ${view === "month" ? "min-h-24" : "min-h-48"}`}>
                  <button type="button" className="text-start text-xs font-bold text-text-secondary" onClick={() => { setAnchor(key); setView("day"); }}>{view === "day" ? dayTitle(key, true) : dayTitle(key)}</button>
                  {dayBlocks.map((e) => <p key={e.id} className="rounded bg-surface-subtle px-2 py-1 text-xs">{fa ? "مسدود" : "Blocked"} {time(e.startAt)}–{time(e.endAt)}{e.providerUserId ? ` · ${staffName(e.providerUserId)}` : ""}</p>)}
                  {view === "month" ? (items.length ? <p className="text-xs">{items.length.toLocaleString(locale)} {fa ? "نوبت" : "bookings"}{items.some((b) => b.bookingStatus === "REQUESTED") ? (fa ? " · درخواست در انتظار" : " · request pending") : ""}</p> : null) : items.map(entry)}
                </section>
              );
            })}
          </div>

          {/* Mobile agenda */}
          <ol className="flex flex-col gap-4 md:hidden">
            {dayKeys.filter((k) => (byDay.get(k)?.length ?? 0) + (blocksByDay.get(k)?.length ?? 0) > 0).map((key) => (
              <li key={key} className="flex flex-col gap-2">
                <h2 className="text-sm font-bold">{dayTitle(key, true)}</h2>
                {(blocksByDay.get(key) ?? []).map((e) => <p key={e.id} className="rounded bg-surface-subtle px-2 py-1 text-xs">{fa ? "مسدود" : "Blocked"} {time(e.startAt)}–{time(e.endAt)}</p>)}
                {(byDay.get(key) ?? []).map(entry)}
              </li>
            ))}
          </ol>
          {bookings.length === 0 && blocks.length === 0 ? <EmptyState title={fa ? "در این بازه نوبتی نیست" : "No bookings in this period"} /> : null}
        </>
      ) : null}

      <Dialog open={blockOpen} onClose={() => setBlockOpen(false)} title={fa ? "مسدود کردن زمان" : "Block time"}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">{fa ? "در این بازه نوبت جدید قابل رزرو نیست. نوبت‌های قطعی موجود لغو نمی‌شوند." : "No new bookings can be made in this period. Existing confirmed bookings are not cancelled."}</p>
          <Input label={fa ? "روز" : "Day"} type="date" value={block.date} onChange={(e) => setBlock({ ...block, date: e.target.value })} />
          <DateReading value={block.date} />
          <div className="grid grid-cols-2 gap-2">
            <Input label={fa ? "از" : "From"} type="time" value={block.start} onChange={(e) => setBlock({ ...block, start: e.target.value })} />
            <Input label={fa ? "تا" : "To"} type="time" value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} />
          </div>
          <label className="flex flex-col gap-1 text-sm">{fa ? "برای" : "For"}
            <select className="rounded border border-border-subtle bg-surface-base p-2" value={block.staff} onChange={(e) => setBlock({ ...block, staff: e.target.value })}>
              <option value="">{fa ? "کل مجموعه" : "Whole location"}</option>
              {staff.map((s) => <option key={s.providerUserId} value={s.providerUserId}>{s.displayName}</option>)}
            </select>
          </label>
          <Input label={fa ? "علت (داخلی)" : "Reason (internal)"} value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} />
          {blockError ? <p role="alert" className="text-state-urgent">{blockError}</p> : null}
          <Button isLoading={busy} disabled={!block.date || block.end <= block.start} onClick={() => void saveBlock()}>{fa ? "ثبت" : "Save"}</Button>
        </div>
      </Dialog>
    </div>
  );
}

/** Offset of `timeZone` from UTC on a given date, in ms (Iran has no DST; this stays correct for zones that do). */
function tzOffsetMs(dateKey: string, timeZone: string): number {
  const probe = new Date(`${dateKey}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(probe);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return asUtc - probe.getTime();
}
