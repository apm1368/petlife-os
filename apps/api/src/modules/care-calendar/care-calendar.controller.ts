import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { IsOptional, IsUUID } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CareCalendarService } from "./care-calendar.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { PetAccessDeniedException } from "../../common/errors/api-exception";

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
    private readonly access: PetAccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser, @Query() query: ListCareCalendarDto) {
    if (query.petId && !(await this.access.getEffectivePermissions(query.petId, user.id))?.canViewCareProfile) throw new PetAccessDeniedException();
    const memberships = await this.prisma.householdMember.findMany({ where: { userId: user.id } });
    const events = await this.careCalendarService.listUpcoming(
      memberships.map((m) => m.householdId),
      query.petId,
    );
    const permitted = new Map(await Promise.all([...new Set(events.map(e => e.petId))].map(async petId => [petId, Boolean((await this.access.getEffectivePermissions(petId, user.id))?.canViewCareProfile)] as const)));
    return events.filter(event => permitted.get(event.petId));
  }
}
