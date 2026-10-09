import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { WaitlistService } from "./waitlist.service";
import { ProviderReviewsService } from "./provider-reviews.service";
import { JoinWaitlistDto } from "./dto/waitlist.dto";
import { CreateProviderReviewDto } from "./dto/review.dto";

/** Consumer-side waitlist, verified reviews and saved providers. */
@Controller()
@UseGuards(SessionAuthGuard)
export class BookingEngagementController {
  constructor(
    private readonly waitlist: WaitlistService,
    private readonly reviews: ProviderReviewsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("waitlist")
  @UseGuards(PetAccessGuard)
  @RequirePetAccess("canBookCare")
  join(@CurrentUser() user: SessionUser, @Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(user.id, dto);
  }

  @Get("waitlist")
  listWaitlist(@CurrentUser() user: SessionUser) {
    return this.waitlist.listMine(user.id);
  }

  @Post("waitlist/:entryId/accept-offer")
  acceptWaitlistOffer(@CurrentUser() user: SessionUser, @Param("entryId", ParseUUIDPipe) id: string) {
    return this.waitlist.acceptOffer(user.id, id);
  }

  @Post("waitlist/:entryId/decline-offer")
  declineWaitlistOffer(@CurrentUser() user: SessionUser, @Param("entryId", ParseUUIDPipe) id: string) {
    return this.waitlist.declineOffer(user.id, id);
  }

  @Post("waitlist/:entryId/cancel")
  cancelWaitlist(@CurrentUser() user: SessionUser, @Param("entryId", ParseUUIDPipe) id: string) {
    return this.waitlist.cancel(user.id, id);
  }

  @Post("bookings/:bookingId/review")
  review(@CurrentUser() user: SessionUser, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Body() dto: CreateProviderReviewDto) {
    return this.reviews.create(user.id, bookingId, dto);
  }

  @Get("me/favorite-providers")
  async favorites(@CurrentUser() user: SessionUser) {
    const rows = await this.prisma.providerFavorite.findMany({ where: { userId: user.id }, include: { providerOrganization: { select: { id: true, name: true, type: true, logoUrl: true, verificationStatus: true } } }, orderBy: { createdAt: "desc" } });
    return rows.filter((r) => r.providerOrganization.verificationStatus === "VERIFIED").map((r) => ({ ...r.providerOrganization, savedAt: r.createdAt.toISOString() }));
  }

  @Put("providers/:providerId/favorite")
  @HttpCode(204)
  async favorite(@CurrentUser() user: SessionUser, @Param("providerId", ParseUUIDPipe) providerId: string): Promise<void> {
    const provider = await this.prisma.providerOrganization.findFirst({ where: { id: providerId, verificationStatus: "VERIFIED" } });
    if (!provider) throw new NotFoundApiException("Provider");
    await this.prisma.providerFavorite.upsert({ where: { userId_providerOrganizationId: { userId: user.id, providerOrganizationId: providerId } }, create: { userId: user.id, providerOrganizationId: providerId }, update: {} });
  }

  @Delete("providers/:providerId/favorite")
  @HttpCode(204)
  async unfavorite(@CurrentUser() user: SessionUser, @Param("providerId", ParseUUIDPipe) providerId: string): Promise<void> {
    await this.prisma.providerFavorite.deleteMany({ where: { userId: user.id, providerOrganizationId: providerId } });
  }
}

/** Public, anonymous-readable reviews for a provider profile. */
@Controller("providers/:providerId/reviews")
export class PublicProviderReviewsController {
  constructor(private readonly reviews: ProviderReviewsService) {}

  @Get()
  async list(@Param("providerId", ParseUUIDPipe) providerId: string) {
    const [summary, reviews] = await Promise.all([this.reviews.summary(providerId), this.reviews.listPublic(providerId)]);
    return { summary, reviews };
  }
}
