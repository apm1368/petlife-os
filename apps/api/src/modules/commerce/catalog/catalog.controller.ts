import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { CatalogService } from "./catalog.service";
import { GetProductDetailDto, SearchProductsDto } from "./dto/search-products.dto";

@UseGuards(SessionAuthGuard)
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("shop/categories")
  categories() {
    return this.catalog.listCategories();
  }

  @Get("shop/products")
  search(@Query() query: SearchProductsDto, @CurrentUser() user: SessionUser) {
    return this.catalog.search(user.id, query);
  }

  @Get("shop/products/:id")
  getDetail(@Param("id") id: string, @Query() query: GetProductDetailDto, @CurrentUser() user: SessionUser) {
    return this.catalog.getDetail(user.id, id, query.petId);
  }

  @Get("shop/products/:id/offers")
  getOffers(@Param("id") id: string) {
    return this.catalog.getOffers(id);
  }
}
