import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { HouseholdMemberGuard } from "../../common/auth/household-member.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { HouseholdActivityService } from "./household-activity.service";

class ActivityQueryDto {
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

@Controller("households/:householdId/activity")
@UseGuards(SessionAuthGuard, HouseholdMemberGuard)
export class HouseholdActivityController {
  constructor(private readonly activity: HouseholdActivityService) {}

  /** Newest first; pass `nextCursor` back as `cursor` for the next page. */
  @Get()
  feed(@Param("householdId", ParseUUIDPipe) householdId: string, @CurrentUser() user: SessionUser, @Query() query: ActivityQueryDto) {
    return this.activity.feed(householdId, user.id, query.cursor, query.limit);
  }
}
