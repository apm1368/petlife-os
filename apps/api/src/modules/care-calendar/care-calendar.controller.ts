import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { IsOptional, IsUUID } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CareCalendarService } from "./care-calendar.service";

class ListCareCalendarDto {
  @IsOptional()
  @IsUUID()
  petId?: string;
}

@Controller("care-calendar")
@UseGuards(SessionAuthGuard)
export class CareCalendarController {
  constructor(
    private readonly careCalendarService: CareCalendarService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser, @Query() query: ListCareCalendarDto) {
    const memberships = await this.prisma.householdMember.findMany({ where: { userId: user.id } });
    return this.careCalendarService.listUpcoming(
      memberships.map((m) => m.householdId),
      query.petId,
    );
  }
}
