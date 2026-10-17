import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ProviderUserRole } from "@prisma/client";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { RequireProviderRole } from "./auth/require-provider-role.decorator";
import { CurrentProviderContext } from "./auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { ProviderCatalogService } from "./provider-catalog.service";
import { WaitlistService } from "../booking/waitlist.service";
import { ProviderReviewsService } from "../booking/provider-reviews.service";
import { WaitlistOfferDto } from "../booking/dto/waitlist.dto";
import { CreateResourceDto, CreateServiceVariantDto, RespondReviewDto, SetStaffServicesDto, UpdateResourceDto, UpdateServiceVariantDto, UpdateStaffProfileDto } from "./dto/provider-catalog.dto";

class AnalyticsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

/** Catalog/team/resource mutations are OWNER-only; operational reads are open to all staff. */
@Controller("provider")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderCatalogController {
  constructor(
    private readonly catalog: ProviderCatalogService,
    private readonly waitlist: WaitlistService,
    private readonly reviews: ProviderReviewsService,
  ) {}

  @Post("services/:serviceId/variants")
  @RequireProviderRole(ProviderUserRole.OWNER)
  createVariant(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("serviceId", ParseUUIDPipe) serviceId: string, @Body() dto: CreateServiceVariantDto) {
    return this.catalog.createVariant(ctx, serviceId, dto);
  }

  @Patch("services/:serviceId/variants/:variantId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  updateVariant(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("serviceId", ParseUUIDPipe) serviceId: string, @Param("variantId", ParseUUIDPipe) variantId: string, @Body() dto: UpdateServiceVariantDto) {
    return this.catalog.updateVariant(ctx, serviceId, variantId, dto);
  }

  @Get("resources")
  listResources(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.catalog.listResources(ctx);
  }

  @Post("resources")
  @RequireProviderRole(ProviderUserRole.OWNER)
  createResource(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateResourceDto) {
    return this.catalog.createResource(ctx, dto);
  }

  @Patch("resources/:id")
  @RequireProviderRole(ProviderUserRole.OWNER)
  updateResource(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateResourceDto) {
    return this.catalog.updateResource(ctx, id, dto);
  }

  @Get("staff")
  listStaff(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.catalog.listStaff(ctx);
  }

  @Put("staff/:providerUserId/services")
  @RequireProviderRole(ProviderUserRole.OWNER)
  setStaffServices(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("providerUserId", ParseUUIDPipe) id: string, @Body() dto: SetStaffServicesDto) {
    return this.catalog.setStaffServices(ctx, id, dto.serviceIds);
  }

  @Patch("staff/:providerUserId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  updateStaff(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("providerUserId", ParseUUIDPipe) id: string, @Body() dto: UpdateStaffProfileDto) {
    return this.catalog.updateStaffProfile(ctx, id, dto);
  }

  @Get("waitlist")
  listWaitlist(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.waitlist.listForProvider(ctx.organizationId);
  }

  /** G13: offer one available slot inside the member's window; expires (15–1440 min, default 120). */
  @Post("waitlist/:entryId/offer")
  @RequireProviderRole(ProviderUserRole.OWNER, ProviderUserRole.STAFF)
  offerWaitlistSlot(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("entryId", ParseUUIDPipe) entryId: string, @Body() dto: WaitlistOfferDto) {
    return this.waitlist.offer(ctx.organizationId, ctx.userId, entryId, dto);
  }

  @Get("reviews")
  listReviews(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.reviews.listForProvider(ctx.organizationId);
  }

  @Post("reviews/:reviewId/respond")
  @RequireProviderRole(ProviderUserRole.OWNER, ProviderUserRole.VET)
  respond(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("reviewId", ParseUUIDPipe) reviewId: string, @Body() dto: RespondReviewDto) {
    return this.reviews.respond(ctx.organizationId, reviewId, dto.response, ctx.userId);
  }

  @Get("analytics")
  analytics(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: AnalyticsQuery) {
    return this.catalog.analytics(ctx, query.days ?? 30);
  }
}
