import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SupportNeedService } from "./support-need.service";
import {
  CreateHelpOfferDto,
  CreateSupportNeedListingDto,
  ListMySupportNeedListingsQueryDto,
  ListSupportNeedListingsQueryDto,
  RequestSupportNeedMediaUploadDto,
  RespondToHelpOfferDto,
  UpdateSupportNeedListingDto,
} from "./dto/support-need.dto";

/**
 * Handoff 22 — the Animal Support classifieds board.
 *
 * spec: "Anonymous: browse, search, filter, open listing. Auth required:
 * publish, offer help, donate, manage listings." GET handlers on the public
 * discovery paths carry no guard by design (mirroring
 * PublicAnimalSupportController); everything that writes, and everything
 * that could reveal a publisher's identity, is behind SessionAuthGuard.
 *
 * Routes are ordered so the literal segments (`mine`, `upload-url`) are
 * declared before the `:listingId` wildcard.
 */
@Controller("animal-support/needs")
export class SupportNeedController {
  constructor(private readonly needs: SupportNeedService) {}

  // -- Public discovery (anonymous) -------------------------------------------

  @Get()
  list(@Query() query: ListSupportNeedListingsQueryDto) {
    return this.needs.listPublic(query);
  }

  /** Distinct provinces/cities with live listings, for the location filter. */
  @Get("locations")
  listLocations() {
    return this.needs.listPublicLocations();
  }

  // -- Publisher: my listings (auth) ------------------------------------------

  @Get("mine")
  @UseGuards(SessionAuthGuard)
  listMine(@CurrentUser() user: SessionUser, @Query() query: ListMySupportNeedListingsQueryDto) {
    return this.needs.listMine(user.id, query);
  }

  /** A helper's own outgoing offers, across every listing. */
  @Get("mine/offers")
  @UseGuards(SessionAuthGuard)
  listMyOffers(@CurrentUser() user: SessionUser) {
    return this.needs.listMyHelpOffers(user.id);
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateSupportNeedListingDto) {
    return this.needs.create(user.id, dto);
  }

  @Post("upload-url")
  @UseGuards(SessionAuthGuard)
  requestImageUpload(@CurrentUser() user: SessionUser, @Body() dto: RequestSupportNeedMediaUploadDto) {
    return this.needs.requestImageUpload(user.id, dto.contentType, dto.fileSizeBytes);
  }

  // -- Single listing ----------------------------------------------------------

  @Get(":listingId")
  getPublic(@Param("listingId") listingId: string) {
    return this.needs.getPublic(listingId);
  }

  /** Coarse fulfillment progress — counts only, never helper identities. */
  @Get(":listingId/summary")
  getSummary(@Param("listingId") listingId: string) {
    return this.needs.getPublicOfferSummary(listingId);
  }

  /** The publisher's own view, which additionally carries the moderation note. */
  @Get(":listingId/manage")
  @UseGuards(SessionAuthGuard)
  getMine(@Param("listingId") listingId: string, @CurrentUser() user: SessionUser) {
    return this.needs.getMine(listingId, user.id);
  }

  @Patch(":listingId")
  @UseGuards(SessionAuthGuard)
  update(@Param("listingId") listingId: string, @CurrentUser() user: SessionUser, @Body() dto: UpdateSupportNeedListingDto) {
    return this.needs.update(listingId, user.id, dto);
  }

  @Post(":listingId/submit")
  @UseGuards(SessionAuthGuard)
  submitForReview(@Param("listingId") listingId: string, @CurrentUser() user: SessionUser) {
    return this.needs.submitForReview(listingId, user.id);
  }

  @Post(":listingId/fulfill")
  @UseGuards(SessionAuthGuard)
  markFulfilled(@Param("listingId") listingId: string, @CurrentUser() user: SessionUser) {
    return this.needs.markFulfilled(listingId, user.id);
  }

  @Post(":listingId/close")
  @UseGuards(SessionAuthGuard)
  close(@Param("listingId") listingId: string, @CurrentUser() user: SessionUser) {
    return this.needs.close(listingId, user.id);
  }

  // -- Help offers -------------------------------------------------------------

  @Post(":listingId/offers")
  @UseGuards(SessionAuthGuard)
  offerHelp(@Param("listingId") listingId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateHelpOfferDto) {
    return this.needs.createHelpOffer(listingId, user.id, dto);
  }

  /** The publisher's inbox for this listing. */
  @Get(":listingId/offers")
  @UseGuards(SessionAuthGuard)
  listOffers(@Param("listingId") listingId: string, @CurrentUser() user: SessionUser) {
    return this.needs.listHelpOffers(listingId, user.id);
  }

  @Patch(":listingId/offers/:offerId")
  @UseGuards(SessionAuthGuard)
  respondToOffer(
    @Param("listingId") listingId: string,
    @Param("offerId") offerId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: RespondToHelpOfferDto,
  ) {
    return this.needs.respondToHelpOffer(listingId, offerId, user.id, dto);
  }
}
