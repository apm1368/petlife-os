import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { ReportPlaceDto } from "./dto/places.dto";

/** Signed-in users can flag outdated or wrong place data; admins review reports. One open report per user per place. */
@Controller("places/:placeId/reports")
@UseGuards(SessionAuthGuard)
export class PlaceReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  @Post()
  async report(@CurrentUser() user: SessionUser, @Param("placeId", ParseUUIDPipe) placeId: string, @Body() dto: ReportPlaceDto) {
    const place = await this.prisma.petFriendlyPlace.findFirst({ where: { id: placeId, isPubliclyListed: true }, select: { id: true } });
    if (!place) throw new NotFoundApiException("Place");
    const open = await this.prisma.placeReport.count({ where: { placeId, userId: user.id, status: "OPEN" } });
    if (open > 0) throw new ValidationApiException({ field: "placeId", reason: "REPORT_ALREADY_OPEN" });
    const row = await this.prisma.placeReport.create({ data: { placeId, userId: user.id, reason: dto.reason, details: dto.details?.trim() || null } });
    await this.events.publish("PlaceReported", { placeId, reportId: row.id }, { aggregateType: "PetFriendlyPlace", aggregateId: placeId });
    return { id: row.id, status: row.status };
  }
}
