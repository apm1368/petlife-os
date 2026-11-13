import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsString, Length, Matches, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminCalendarService } from "./admin-calendar.service";

class YearQueryDto {
  @Type(() => Number) @IsInt() @Min(1400) @Max(1450) year!: number;
}
class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}
class ChangeDayDto extends ReasonDto {
  @IsBoolean() closed!: boolean;
  @IsString() @Length(2, 120) title!: string;
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
class DateParam {
  @Matches(DATE) date!: string;
}

/** Settings → Holidays and closures. Reading is settings.view; every change is settings.manage, needs a reason and is audited. */
@Controller("admin/calendar/days")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminCalendarController {
  constructor(private readonly calendar: AdminCalendarService) {}

  @Get()
  @RequireAdminPermission("settings.view")
  year(@Query() q: YearQueryDto) {
    return this.calendar.year(q.year);
  }

  @Put(":date")
  @RequireAdminPermission("settings.manage")
  change(@CurrentAdmin() admin: ResolvedAdminContext, @Param() p: DateParam, @Body() dto: ChangeDayDto) {
    return this.calendar.change(admin, p.date, dto);
  }

  @Post(":date/clear")
  @RequireAdminPermission("settings.manage")
  clear(@CurrentAdmin() admin: ResolvedAdminContext, @Param() p: DateParam, @Body() dto: ReasonDto) {
    return this.calendar.clear(admin, p.date, dto.reason);
  }
}
