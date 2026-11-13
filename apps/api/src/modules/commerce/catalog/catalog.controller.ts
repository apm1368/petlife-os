import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { OptionalSessionAuthGuard } from "../../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { CatalogService } from "./catalog.service";
import { GetProductDetailDto, SearchProductsDto } from "./dto/search-products.dto";

class StorefrontQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) page?: number;
}

/** Shop discovery/product detail is public browsing (Handoff 12) — OptionalSessionAuthGuard personalizes compatibility for a signed-in caller but never requires one. */
@UseGuards(OptionalSessionAuthGuard)
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("shop/categories")
  categories() {
    return this.catalog.listCategories();
  }

  @Get("shop/products")
  search(@Query() query: SearchProductsDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    const { attr, ...rest } = query;
    return this.catalog.search(user?.id, { ...rest, attributes: attr });
  }

  @Get("shop/products/:id")
  getDetail(@Param("id", ParseUUIDPipe) id: string, @Query() query: GetProductDetailDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.catalog.getDetail(user?.id, id, query.petId);
  }

  @Get("shop/products/:id/offers")
  getOffers(@Param("id", ParseUUIDPipe) id: string) {
    return this.catalog.getOffers(id);
  }

  /** A verified seller's public storefront, by its slug (or id when it has none). Unknown or unverified → 404. */
  @Get("shop/sellers/:slug")
  async storefront(@Param("slug") slug: string, @Query() query: StorefrontQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    if (!/^[\p{L}\p{N}-]{2,80}$/u.test(slug)) throw new NotFoundException();
    const result = await this.catalog.storefront(user?.id, slug, query.page ?? 1);
    if (!result) throw new NotFoundException();
    return result;
  }
}
