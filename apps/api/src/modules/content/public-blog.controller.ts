import { Throttle } from "@nestjs/throttler";
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { Locale } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { OptionalSessionAuthGuard } from "../../common/auth/optional-session-auth.guard";
import { CurrentUser, OptionalCurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
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
class ArticleFeedbackDto {
  @IsIn(["HELPFUL", "NOT_HELPFUL"]) vote!: "HELPFUL" | "NOT_HELPFUL";
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class ArticleFeedQueryDto {
  @IsOptional() @IsEnum(Locale) locale?: Locale;
  @IsOptional() @Transform(({ value }) => value === true || value === "true" || value === "1") @IsBoolean() withBody?: boolean;
}

@Controller("blog")
export class PublicBlogController {
  constructor(private readonly content: PublicContentReadService) {}

  @Get("articles")
  listArticles(@Query() query: ListPublicArticlesQueryDto) {
    return this.content.listArticles(query.locale, query);
  }

  /** Sitemap / RSS / llms.txt source: every visible article locale. Declared before `articles/:slug` so "feed" is never read as a slug. */
  @Get("feed")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  feed(@Query() query: ArticleFeedQueryDto) {
    return this.content.feed(query.locale, query.withBody === true);
  }

  /** Where a renamed article's old slug points now (404 when it is not an old address of a visible article). */
  @Get("slug-redirects/:slug")
  slugRedirect(@Param("slug") slug: string, @Query() query: LocaleQueryDto) {
    return this.content.slugRedirect(query.locale, slug);
  }

  @Get("articles/:slug")
  getArticle(@Param("slug") slug: string, @Query() query: LocaleQueryDto) {
    return this.content.getArticleBySlug(query.locale, slug);
  }

  @Get("articles/:slug/related")
  related(@Param("slug") slug: string, @Query() query: LocaleQueryDto) {
    return this.content.relatedArticles(query.locale, slug);
  }

  @Get("articles/:slug/feedback")
  @UseGuards(OptionalSessionAuthGuard)
  feedback(@Param("slug") slug: string, @Query() query: LocaleQueryDto, @OptionalCurrentUser() user: SessionUser | undefined) {
    return this.content.feedbackSummary(query.locale, slug, user?.id);
  }

  /** Signed-in members only; feedback is never shown as public comments on (medical) content. */
  @Post("articles/:slug/feedback")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  giveFeedback(@Param("slug") slug: string, @Query() query: LocaleQueryDto, @CurrentUser() user: SessionUser, @Body() dto: ArticleFeedbackDto) {
    return this.content.giveFeedback(query.locale, slug, user.id, dto.vote, dto.reason);
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
