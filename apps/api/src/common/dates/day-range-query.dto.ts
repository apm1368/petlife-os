import { IsOptional, Matches } from "class-validator";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `?from=yyyy-mm-dd&to=yyyy-mm-dd` — see parseDayRange for defaults and limits. */
export class DayRangeQueryDto {
  @IsOptional()
  @Matches(DAY)
  from?: string;

  @IsOptional()
  @Matches(DAY)
  to?: string;
}
