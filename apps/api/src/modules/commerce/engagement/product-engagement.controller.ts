import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { ProductEngagementService } from "./product-engagement.service";

class CreateProductReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;
}

class ListReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

@Controller()
export class ProductEngagementController {
  constructor(private readonly engagement: ProductEngagementService) {}

  /** Public: published, verified-purchase reviews only. */
  @Get("shop/products/:id/reviews")
  listReviews(@Param("id", ParseUUIDPipe) id: string, @Query() query: ListReviewsDto) {
    return this.engagement.listReviews(id, query.page, query.pageSize);
  }

  @Post("orders/:orderId/items/:itemId/review")
  @UseGuards(SessionAuthGuard)
  createReview(@CurrentUser() user: SessionUser, @Param("orderId", ParseUUIDPipe) orderId: string, @Param("itemId", ParseUUIDPipe) itemId: string, @Body() dto: CreateProductReviewDto) {
    return this.engagement.createReview(user.id, orderId, itemId, dto);
  }

  @Put("shop/products/:id/favorite")
  @UseGuards(SessionAuthGuard)
  favorite(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.engagement.setFavorite(user.id, id, true);
  }

  @Delete("shop/products/:id/favorite")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard)
  unfavorite(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.engagement.setFavorite(user.id, id, false);
  }

  @Get("me/favorite-products")
  @UseGuards(SessionAuthGuard)
  listFavorites(@CurrentUser() user: SessionUser) {
    return this.engagement.listFavorites(user.id);
  }
}
