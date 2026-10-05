import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsIn, IsOptional } from "class-validator";
import { PlaceSuggestionStatus } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { ReviewPlaceSuggestionDto, SuggestPlaceDto } from "../places/dto/places.dto";
import { PlaceSuggestionService } from "./place-suggestion.service";

class SuggestionStatusQuery {
  @IsOptional() @IsIn(["PENDING", "APPROVED", "REJECTED"]) status?: PlaceSuggestionStatus;
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

  @Post(":id/approve")
  @RequireAdminPermission("places.manage")
  approve(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewPlaceSuggestionDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.suggestions.approve(admin, id, dto.note);
  }

  @Post(":id/reject")
  @RequireAdminPermission("places.manage")
  reject(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewPlaceSuggestionDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.suggestions.reject(admin, id, dto.note);
  }
}
