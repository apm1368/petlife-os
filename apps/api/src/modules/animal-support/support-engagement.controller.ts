import { Body, Controller, createParamDecorator, Delete, ExecutionContext, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { VolunteerInterestStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { NgoAuthGuard } from "./ngo-auth.guard";
import type { NgoContext } from "./ngo-portal.service";
import { SupportEngagementService, VOLUNTEER_KINDS } from "./support-engagement.service";

const CurrentNgo = createParamDecorator((_: unknown, ctx: ExecutionContext): NgoContext => ctx.switchToHttp().getRequest<{ ngoContext: NgoContext }>().ngoContext);

class PostUpdateDto {
  @IsString() @Length(1, 2000) body!: string;
}
class VolunteerInterestDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ArrayUnique() @IsIn(VOLUNTEER_KINDS, { each: true }) kinds!: string[];
  @IsString() @Length(1, 80) city!: string;
  @IsOptional() @IsString() @MaxLength(200) availability?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsBoolean() shareContact?: boolean;
}
class InterestStatusDto {
  @IsIn(["NEW", "CONTACTED", "CLOSED"]) status!: VolunteerInterestStatus;
}
class InterestQueryDto {
  @IsOptional() @IsIn(["NEW", "CONTACTED", "CLOSED"]) status?: VolunteerInterestStatus;
}

/** Public reads of a need's updates and derived milestones. */
@Controller("animal-support/needs/:listingId")
export class PublicSupportEngagementController {
  constructor(private readonly engagement: SupportEngagementService) {}

  @Get("updates")
  updates(@Param("listingId", ParseUUIDPipe) listingId: string) {
    return this.engagement.listUpdates(listingId);
  }

  @Get("milestones")
  milestones(@Param("listingId", ParseUUIDPipe) listingId: string) {
    return this.engagement.milestones(listingId);
  }
}

@Controller()
@UseGuards(SessionAuthGuard)
export class SupportEngagementController {
  constructor(private readonly engagement: SupportEngagementService) {}

  @Post("animal-support/needs/:listingId/updates")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  postUpdate(@CurrentUser() user: SessionUser, @Param("listingId", ParseUUIDPipe) listingId: string, @Body() dto: PostUpdateDto) {
    return this.engagement.postUpdate(user.id, listingId, dto.body);
  }

  @Delete("animal-support/needs/:listingId/updates/:updateId")
  removeUpdate(@CurrentUser() user: SessionUser, @Param("listingId", ParseUUIDPipe) listingId: string, @Param("updateId", ParseUUIDPipe) updateId: string) {
    return this.engagement.removeUpdate(user.id, listingId, updateId);
  }

  @Post("animal-support/needs/:listingId/save")
  save(@CurrentUser() user: SessionUser, @Param("listingId", ParseUUIDPipe) listingId: string) {
    return this.engagement.save(user.id, listingId, true);
  }

  @Delete("animal-support/needs/:listingId/save")
  unsave(@CurrentUser() user: SessionUser, @Param("listingId", ParseUUIDPipe) listingId: string) {
    return this.engagement.save(user.id, listingId, false);
  }

  @Post("animal-support/organizations/:organizationId/follow")
  follow(@CurrentUser() user: SessionUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.engagement.follow(user.id, organizationId, true);
  }

  @Delete("animal-support/organizations/:organizationId/follow")
  unfollow(@CurrentUser() user: SessionUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.engagement.follow(user.id, organizationId, false);
  }

  @Post("animal-support/organizations/:organizationId/volunteer")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  volunteer(@CurrentUser() user: SessionUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: VolunteerInterestDto) {
    return this.engagement.registerInterest(user.id, organizationId, dto);
  }

  @Delete("animal-support/organizations/:organizationId/volunteer")
  withdraw(@CurrentUser() user: SessionUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.engagement.withdrawInterest(user.id, organizationId);
  }

  @Get("me/followed-organizations")
  followed(@CurrentUser() user: SessionUser) {
    return this.engagement.followedOrganizations(user.id);
  }

  @Get("me/saved-needs")
  saved(@CurrentUser() user: SessionUser) {
    return this.engagement.savedNeeds(user.id);
  }

  @Get("me/volunteer-interests")
  interests(@CurrentUser() user: SessionUser) {
    return this.engagement.myInterests(user.id);
  }
}

/** Organisation staff: volunteer interest for their organisation. */
@Controller("ngo/volunteers")
@UseGuards(SessionAuthGuard, NgoAuthGuard)
export class NgoVolunteersController {
  constructor(private readonly engagement: SupportEngagementService) {}

  @Get()
  list(@CurrentNgo() ngo: NgoContext, @Query() query: InterestQueryDto) {
    return this.engagement.orgInterests(ngo.organizationId, query.status);
  }

  @Post(":interestId/status")
  setStatus(@CurrentNgo() ngo: NgoContext, @Param("interestId", ParseUUIDPipe) interestId: string, @Body() dto: InterestStatusDto) {
    return this.engagement.setInterestStatus(ngo.organizationId, interestId, dto.status);
  }
}
