import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsIn, IsOptional } from "class-validator";
import { PlaceSuggestionKind, PlaceSuggestionStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { RejectPlaceSuggestionDto, RequestPlaceSuggestionPhotoUploadDto, ReviewPlaceSuggestionDto, SuggestPlaceChangeDto, SuggestPlaceDto } from "../places/dto/places.dto";
import { PlaceSuggestionService } from "./place-suggestion.service";

class SuggestionStatusQuery {
  @IsOptional() @IsIn(["PENDING", "APPROVED", "REJECTED"]) status?: PlaceSuggestionStatus;
}

class SuggestionQueueQuery extends SuggestionStatusQuery {
  @IsOptional() @IsIn(Object.values(PlaceSuggestionKind)) kind?: PlaceSuggestionKind;
}

@Controller("place-suggestions")
@UseGuards(SessionAuthGuard)
export class PlaceSuggestionsController {
  constructor(private readonly suggestions: PlaceSuggestionService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  suggest(@CurrentUser() user: SessionUser, @Body() dto: SuggestPlaceDto) {
    return this.suggestions.suggest(user.id, dto);
  }

  /** Owner #6: a private upload slot for a suggestion photo; PUT the bytes, then send the key in photoObjectKeys. */
  @Post("photo-upload-url")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  photoUploadUrl(@CurrentUser() user: SessionUser, @Body() dto: RequestPlaceSuggestionPhotoUploadDto) {
    return this.suggestions.requestPhotoUpload(user.id, dto.contentType, dto.fileSizeBytes);
  }

  /** Correction or closure report for an existing public place (moderated). */
  @Post("changes")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  suggestChange(@CurrentUser() user: SessionUser, @Body() dto: SuggestPlaceChangeDto) {
    return this.suggestions.suggestChange(user.id, dto);
  }

  @Get("mine")
  mine(@CurrentUser() user: SessionUser) {
    return this.suggestions.mine(user.id);
  }
}

@Controller("admin/place-suggestions")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPlaceSuggestionsController {
  constructor(private readonly suggestions: PlaceSuggestionService) {}

  @Get()
  @RequireAdminPermission("places.view")
  list(@Query() query: SuggestionStatusQuery) {
    return this.suggestions.adminList(query.status);
  }

  /** The review tab: submitter, current place values, duplicate hints and per-status counts (owner #6). */
  @Get("queue")
  @RequireAdminPermission("places.view")
  queue(@Query() query: SuggestionQueueQuery) {
    return this.suggestions.adminQueue(query);
  }

  @Post(":id/approve")
  @RequireAdminPermission("places.manage")
  approve(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewPlaceSuggestionDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.suggestions.approve(admin, id, dto);
  }

  @Post(":id/reject")
  @RequireAdminPermission("places.manage")
  reject(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RejectPlaceSuggestionDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.suggestions.reject(admin, id, dto.note);
  }
}
