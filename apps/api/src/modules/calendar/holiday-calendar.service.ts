import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { IRAN_HOLIDAY_YEARS, IRAN_OFFICIAL_HOLIDAYS } from "../../common/time/iran-holidays.data";

const REFRESH_MS = 5 * 60_000;

export interface CalendarDay {
  date: string;
  /** Persian calendar date when the day is an official holiday. */
  jalali: string | null;
  title: string;
  /** Closed for business after staff changes are applied. */
  closed: boolean;
  official: { title: string; religious: boolean } | null;
  staff: { closed: boolean; title: string; reason: string; updatedAt: string } | null;
}

/**
 * The business calendar: Iran's official holidays (generated into the repo once a year) with staff changes on top —
 * a sudden closure, or an official holiday opened as a working day. Nothing here calls a third party; staff changes
 * are cached in memory (single API process) and refreshed every few minutes and right after an edit.
 */
@Injectable()
export class HolidayCalendarService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HolidayCalendarService.name);
  private overrides = new Map<string, { closed: boolean; title: string; reason: string; updatedAt: Date }>();
  private closed: ReadonlySet<string> = new Set(IRAN_OFFICIAL_HOLIDAYS.map((h) => h.date));
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((e) => this.logger.error("Calendar overrides failed to load; official holidays only", e instanceof Error ? e.stack : undefined));
    if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => void this.refresh().catch(() => undefined), REFRESH_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh() {
    const rows = await this.prisma.calendarDayOverride.findMany();
    this.overrides = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), { closed: r.closed, title: r.title, reason: r.reason, updatedAt: r.updatedAt }]));
    const closed = new Set(IRAN_OFFICIAL_HOLIDAYS.map((h) => h.date));
    for (const [date, o] of this.overrides) {
      if (o.closed) closed.add(date);
      else closed.delete(date);
    }
    this.closed = closed;
  }

  /** Tehran dates (YYYY-MM-DD) closed for business on top of the weekly pattern — for businessHoursBetween(). */
  closedDays(): ReadonlySet<string> {
    return this.closed;
  }

  isClosed(date: string): boolean {
    return this.closed.has(date);
  }

  /** Persian years the official list covers, and whether their lunar holidays are still provisional. */
  coverage() {
    return Object.entries(IRAN_HOLIDAY_YEARS).map(([year, status]) => ({ year: Number(year), status }));
  }

  /** Every official holiday or staff-changed day in [from, to] (inclusive Tehran dates). */
  days(from: string, to: string): CalendarDay[] {
    const official = new Map(IRAN_OFFICIAL_HOLIDAYS.filter((h) => h.date >= from && h.date <= to).map((h) => [h.date, h]));
    const dates = new Set<string>([...official.keys(), ...[...this.overrides.keys()].filter((d) => d >= from && d <= to)]);
    return [...dates].sort().map((date) => {
      const o = official.get(date) ?? null;
      const s = this.overrides.get(date) ?? null;
      return {
        date,
        jalali: o?.jalali ?? null,
        title: s?.title ?? o?.title ?? "",
        closed: s ? s.closed : !!o,
        official: o ? { title: o.title, religious: o.religious } : null,
        staff: s ? { closed: s.closed, title: s.title, reason: s.reason, updatedAt: s.updatedAt.toISOString() } : null,
      };
    });
  }
}
