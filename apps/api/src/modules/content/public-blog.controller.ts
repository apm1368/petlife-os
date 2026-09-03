import { Controller, Get, Param, Query } from "@nestjs/common";
import { PublicContentReadService } from "./public-content-read.service";
import { ListPublicArticlesQueryDto, LocaleQueryDto } from "./dto/public-content.dto";

/**
 * The consumer-facing Blog surface (spec: "public API: list visible
 * articles, article by localized slug, categories, tags, filtered article
 * list"). No session/auth guard at all — this is a public, anonymous-
 * readable surface by design, exactly like /shop/products or
 * /providers/vets. Every read here delegates straight to
 * PublicContentReadService, which is the only place VISIBLE-only filtering
 * is enforced.
 */
@Controller("blog")
export class PublicBlogController {
  constructor(private readonly content: PublicContentReadService) {}

  @Get("articles")
  listArticles(@Query() query: ListPublicArticlesQueryDto) {
    return this.content.listArticles(query.locale, query);
  }

  @Get("articles/:slug")
  getArticle(@Param("slug") slug: string, @Query() query: LocaleQueryDto) {
    return this.content.getArticleBySlug(query.locale, slug);
  }

  @Get("categories")
  listCategories(@Query() query: LocaleQueryDto) {
    return this.content.listCategories(query.locale);
  }

  @Get("categories/:slug")
  getCategory(@Param("slug") slug: string, @Query() query: LocaleQueryDto) {
    return this.content.getCategoryBySlug(query.locale, slug);
  }

  @Get("tags")
  listTags(@Query() query: LocaleQueryDto) {
    return this.content.listTags(query.locale);
  }

  @Get("tags/:slug")
  getTag(@Param("slug") slug: string, @Query() query: LocaleQueryDto) {
    return this.content.getTagBySlug(query.locale, slug);
  }
}
