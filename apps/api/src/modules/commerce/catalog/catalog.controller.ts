import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { OptionalSessionAuthGuard } from "../../../common/auth/optional-session-auth.guard";
import { OptionalCurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { CatalogService } from "./catalog.service";
import { GetProductDetailDto, SearchProductsDto } from "./dto/search-products.dto";

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
}
