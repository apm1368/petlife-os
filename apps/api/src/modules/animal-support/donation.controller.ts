import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { DonationService } from "./donation.service";
import { CreateDonationDto, ListDonationHistoryQueryDto } from "./dto/animal-support.dto";

/**
 * Authenticated donor surface — donate (payment execution requires a real
 * userId, see DonationService.donate's own doc comment) and the donor's own
 * receipt/history (spec: "support clear receipt/history for authenticated
 * donors" — never shown to anyone but the donor themselves).
 */
@Controller()
@UseGuards(SessionAuthGuard)
export class DonationController {
  constructor(private readonly donations: DonationService) {}

  @Post("animal-support/campaigns/:campaignId/donate")
  donate(@Param("campaignId") campaignId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateDonationDto) {
    return this.donations.donate(campaignId, user.id, dto);
  }

  @Get("me/donations")
  listHistory(@CurrentUser() user: SessionUser, @Query() query: ListDonationHistoryQueryDto) {
    return this.donations.listHistory(user.id, query);
  }
}
