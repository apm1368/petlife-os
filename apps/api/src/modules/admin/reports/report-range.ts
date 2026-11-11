import type { AdminReportGranularity } from "@petlife/types";

/** Iran has kept a fixed UTC+03:30 offset since DST was abolished in 2022, so a constant shift is exact. */
export const TEHRAN_OFFSET_MS = 3.5 * 3_600_000;
const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 731;
export const MAX_BUCKETS = 400;

export interface ResolvedReportRange {
  /** Local (Tehran) calendar dates, inclusive. */
  from: string;
  to: string;
  /** UTC instants: [startUtc, endUtc). */
  startUtc: Date;
  endUtc: Date;
  previousStartUtc: Date;
  previousEndUtc: Date;
  previousFrom: string;
  previousTo: string;
  granularity: AdminReportGranularity;
  days: number;
}

function parseLocalDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`invalid date ${value}`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new RangeError(`invalid date ${value}`);
  return ms;
}

/** Local midnight (as a UTC-epoch "wall clock" ms) → the real UTC instant. */
const wallToUtc = (wallMs: number) => new Date(wallMs - TEHRAN_OFFSET_MS);
const wallDate = (wallMs: number) => new Date(wallMs).toISOString().slice(0, 10);

/** Today's Tehran calendar date. */
export function tehranToday(now = new Date()): string {
  return wallDate(now.getTime() + TEHRAN_OFFSET_MS);
}

/** The coarsest granularity that still gives a readable number of points. */
export function defaultGranularity(days: number): AdminReportGranularity {
  if (days <= 62) return "day";
  if (days <= 200) return "week";
  return "month";
}

/**
 * Resolves a report window. Both ends are Tehran calendar dates and inclusive; the comparison window is the
 * same number of days immediately before, so "vs previous period" always compares like with like.
 */
export function resolveReportRange(input: { from?: string; to?: string; granularity?: AdminReportGranularity }, now = new Date()): ResolvedReportRange {
  const to = input.to ?? tehranToday(now);
  const toWall = parseLocalDate(to);
  const fromWall = input.from ? parseLocalDate(input.from) : toWall - 29 * DAY_MS;
  if (fromWall > toWall) throw new RangeError("from must not be after to");
  const days = Math.round((toWall - fromWall) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) throw new RangeError("range too long");
  const granularity = input.granularity ?? defaultGranularity(days);
  const endWall = toWall + DAY_MS;
  const previousEndWall = fromWall;
  const previousStartWall = fromWall - days * DAY_MS;
  const range: ResolvedReportRange = {
    from: wallDate(fromWall),
    to: wallDate(toWall),
    startUtc: wallToUtc(fromWall),
    endUtc: wallToUtc(endWall),
    previousStartUtc: wallToUtc(previousStartWall),
    previousEndUtc: wallToUtc(previousEndWall),
    previousFrom: wallDate(previousStartWall),
    previousTo: wallDate(previousEndWall - DAY_MS),
    granularity,
    days,
  };
  if (bucketKeys(range).length > MAX_BUCKETS) throw new RangeError("too many buckets");
  return range;
}

/** Start of the bucket holding a wall-clock day, matching PostgreSQL date_trunc (weeks start on Monday). */
export function bucketStart(wallMs: number, granularity: AdminReportGranularity): number {
  const d = new Date(wallMs);
  if (granularity === "day") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (granularity === "month") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const isoWeekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  return day - isoWeekday * DAY_MS;
}

/** Every bucket key (YYYY-MM-DD of the bucket start) covering the range, in order, gaps included. */
export function bucketKeys(range: Pick<ResolvedReportRange, "from" | "to" | "granularity">): string[] {
  const keys: string[] = [];
  const end = parseLocalDate(range.to);
  let cursor = bucketStart(parseLocalDate(range.from), range.granularity);
  while (cursor <= end && keys.length <= MAX_BUCKETS) {
    keys.push(wallDate(cursor));
    if (range.granularity === "day") cursor += DAY_MS;
    else if (range.granularity === "week") cursor += 7 * DAY_MS;
    else {
      const d = new Date(cursor);
      cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
  }
  return keys;
}

/** Change against the previous window, as a fraction; null when there is nothing to compare with. */
export function delta(value: number, previous: number): number | null {
  if (previous === 0) return value === 0 ? 0 : null;
  return (value - previous) / previous;
}
