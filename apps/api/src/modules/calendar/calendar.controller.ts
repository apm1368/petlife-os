import { Controller, Get, Header, Query } from "@nestjs/common";
import { IsString, Matches } from "class-validator";
import { ValidationApiException } from "../../common/errors/api-exception";
import { HolidayCalendarService } from "./holiday-calendar.service";

class RangeQueryDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
}

const MAX_RANGE_DAYS = 400;

/** Public: the days the business is closed (official holidays and staff closures), for booking and delivery dates. */
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: HolidayCalendarService) {}

  @Get("closed-days")
  @Header("Cache-Control", "public, max-age=900")
  closedDays(@Query() q: RangeQueryDto) {
    const span = (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(span) || span < 0 || span > MAX_RANGE_DAYS) throw new ValidationApiException({ range: `from..to must be a valid range of at most ${MAX_RANGE_DAYS} days` });
    return {
      from: q.from,
      to: q.to,
      weeklyClosed: ["FRIDAY"],
      days: this.calendar.days(q.from, q.to).filter((d) => d.closed).map((d) => ({ date: d.date, jalali: d.jalali, title: d.title })),
    };
  }
}
