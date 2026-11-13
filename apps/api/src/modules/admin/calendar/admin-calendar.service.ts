import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminGovernanceRuleException, ValidationApiException } from "../../../common/errors/api-exception";
import { persianYearRange, tehranDateKey } from "../../../common/time/iran-holidays";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { HolidayCalendarService } from "../../calendar/holiday-calendar.service";

const DAY = 86_400_000;
/** Staff may change days from a month back to two years ahead. */
const PAST_DAYS = 31;
const FUTURE_DAYS = 2 * 366;

/** Settings → Holidays and closures: the official list per Persian year, and staff changes on top (audited). */
@Injectable()
export class AdminCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly calendar: HolidayCalendarService,
  ) {}

  year(year: number) {
    const { from, to } = persianYearRange(year);
    const coverage = this.calendar.coverage().find((c) => c.year === year)?.status ?? null;
    return { year, from, to, coverage, today: tehranDateKey(new Date()), days: this.calendar.days(from, to) };
  }

  /** Close a normally open day, or open an official holiday as a working day. Fridays follow the weekly pattern. */
  async change(admin: ResolvedAdminContext, date: string, input: { closed: boolean; title: string; reason: string }) {
    this.assertEditable(date);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 5) throw new AdminGovernanceRuleException({ rule: "CALENDAR_FRIDAY" });
    const official = this.calendar.days(date, date)[0]?.official ?? null;
    // Only real changes: an official holiday can be opened, any other day can be closed.
    if (!input.closed && !official) throw new AdminGovernanceRuleException({ rule: "CALENDAR_ALREADY_OPEN" });
    if (input.closed && official) throw new AdminGovernanceRuleException({ rule: "CALENDAR_ALREADY_CLOSED" });
    const before = await this.prisma.calendarDayOverride.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } });
    const data = { closed: input.closed, title: input.title.trim(), reason: input.reason.trim(), updatedByAdminId: admin.adminUserId };
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarDayOverride.upsert({ where: { date: new Date(`${date}T00:00:00Z`) }, create: { date: new Date(`${date}T00:00:00Z`), ...data }, update: data });
      await this.audit.record({
        adminUserId: admin.adminUserId, action: "calendar_day.changed", entityType: "CalendarDay", reason: data.reason,
        beforeSummary: { date, closed: before ? before.closed : !!official, title: before?.title ?? official?.title ?? null },
        afterSummary: { date, closed: data.closed, title: data.title }, tx,
      });
    });
    await this.calendar.refresh();
    return this.calendar.days(date, date)[0]!;
  }

  /** Drop the staff change, so the day follows the official list again. */
  async clear(admin: ResolvedAdminContext, date: string, reason: string) {
    this.assertEditable(date);
    const before = await this.prisma.calendarDayOverride.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } });
    if (!before) throw new AdminGovernanceRuleException({ rule: "CALENDAR_NO_STAFF_CHANGE" });
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarDayOverride.delete({ where: { date: before.date } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "calendar_day.cleared", entityType: "CalendarDay", reason: reason.trim(), beforeSummary: { date, closed: before.closed, title: before.title }, tx });
    });
    await this.calendar.refresh();
    return { date, day: this.calendar.days(date, date)[0] ?? null };
  }

  private assertEditable(date: string) {
    const t = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date) throw new ValidationApiException({ date: "Not a calendar date" });
    const today = Date.parse(`${tehranDateKey(new Date())}T00:00:00Z`);
    if (t < today - PAST_DAYS * DAY || t > today + FUTURE_DAYS * DAY) throw new AdminGovernanceRuleException({ rule: "CALENDAR_OUT_OF_RANGE" });
  }
}
