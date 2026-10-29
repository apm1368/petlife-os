import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { DayRangeQueryDto } from "../../common/dates/day-range-query.dto";
import { PetYearReviewService } from "./pet-year-review.service";

@Controller("pets/:petId/year-review")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class PetYearReviewController {
  constructor(private readonly yearReview: PetYearReviewService) {}

  @Get()
  @RequirePetAccess("canViewIdentity")
  get(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Query() query: DayRangeQueryDto) {
    return this.yearReview.get(petId, user.id, query);
  }
}
