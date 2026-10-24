import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, Length } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { MemberAppealsService } from "./member-appeals.service";

class SubmitMemberAppealDto {
  @IsString() @Length(10, 2000) reason!: string;
}

@Controller("me")
@UseGuards(SessionAuthGuard)
export class MemberTrustController {
  constructor(private readonly appeals: MemberAppealsService) {}

  /** Moderation decisions that affected the member, with whether they can still appeal. */
  @Get("moderation-decisions")
  decisions(@CurrentUser() user: SessionUser) {
    return this.appeals.decisions(user.id);
  }

  @Post("moderation-decisions/:actionId/appeal")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  appeal(@CurrentUser() user: SessionUser, @Param("actionId", ParseUUIDPipe) actionId: string, @Body() dto: SubmitMemberAppealDto) {
    return this.appeals.submit(user.id, actionId, dto.reason);
  }

  @Get("appeals")
  mine(@CurrentUser() user: SessionUser) {
    return this.appeals.mine(user.id);
  }

  @Post("appeals/:appealId/withdraw")
  withdraw(@CurrentUser() user: SessionUser, @Param("appealId", ParseUUIDPipe) appealId: string) {
    return this.appeals.withdraw(user.id, appealId);
  }
}
