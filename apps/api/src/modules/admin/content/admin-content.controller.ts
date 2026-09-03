import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ContentPlacementKey, Locale } from "@prisma/client";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminArticleService } from "./admin-article.service";
import { AdminCategoryService } from "./admin-category.service";
import { AdminTagService } from "./admin-tag.service";
import { AdminContentAuthorService } from "./admin-content-author.service";
import { AdminMediaService } from "./admin-media.service";
import { AdminContentVersionService } from "./admin-content-version.service";
import { AdminContentPlacementService } from "./admin-content-placement.service";
import { CreateArticleDto, ListArticlesQueryDto, SaveArticleLocaleDto, UpdateArticleDto } from "./dto/admin-article.dto";
import { SaveCategoryDto, SaveTagDto } from "./dto/admin-taxonomy.dto";
import { ContentAuthorInputDto, UpdateContentAuthorDto } from "./dto/admin-content-author.dto";
import { ConfirmMediaUploadDto, RequestMediaUploadDto, UpdateMediaMetadataDto } from "./dto/admin-media.dto";
import { ReplaceContentBlocksDto } from "./dto/admin-content-placement.dto";

/**
 * The Handoff 15 admin CMS surface — Articles/Categories/Tags/Authors/
 * Media/Placements, entirely behind AdminAuthGuard, one `content.*`
 * permission per action (spec: "prefer permissions over hardcoded role
 * checks... do not grant publishing rights to SUPPORT by default" —
 * SUPPORT receives no content.* permission at all, see admin-permissions.ts).
 * Publish/hide/archive are separate routes with their own permissions from
 * create/edit (spec: "editing and publishing should be separate actions").
 */
@Controller("admin/content")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminContentController {
  constructor(
    private readonly articles: AdminArticleService,
    private readonly categories: AdminCategoryService,
    private readonly tags: AdminTagService,
    private readonly authors: AdminContentAuthorService,
    private readonly media: AdminMediaService,
    private readonly versions: AdminContentVersionService,
    private readonly placements: AdminContentPlacementService,
  ) {}

  // --- Articles --------------------------------------------------------

  @Get("articles")
  @RequireAdminPermission("content.view")
  listArticles(@Query() query: ListArticlesQueryDto) {
    return this.articles.list(query);
  }

  @Get("articles/:id")
  @RequireAdminPermission("content.view")
  getArticle(@Param("id") id: string) {
    return this.articles.get(id);
  }

  @Post("articles")
  @RequireAdminPermission("content.create")
  createArticle(@Body() dto: CreateArticleDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.articles.create(admin, dto, request.requestId);
  }

  @Patch("articles/:id")
  @RequireAdminPermission("content.edit")
  updateArticle(@Param("id") id: string, @Body() dto: UpdateArticleDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.articles.update(admin, id, dto, request.requestId);
  }

  @Get("articles/:id/locales/:locale")
  @RequireAdminPermission("content.view")
  getArticleLocale(@Param("id") id: string, @Param("locale", new ParseEnumPipe(Locale)) locale: Locale) {
    return this.articles.getLocale(id, locale);
  }

  @Put("articles/:id/locales/:locale")
  @RequireAdminPermission("content.edit")
  saveArticleLocale(@Param("id") id: string, @Param("locale", new ParseEnumPipe(Locale)) locale: Locale, @Body() dto: SaveArticleLocaleDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.articles.saveLocale(admin, id, locale, dto, request.requestId);
  }

  @Post("articles/:id/locales/:locale/publish")
  @RequireAdminPermission("content.publish")
  publishArticleLocale(@Param("id") id: string, @Param("locale", new ParseEnumPipe(Locale)) locale: Locale, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.articles.publish(admin, id, locale, request.requestId);
  }

  @Post("articles/:id/locales/:locale/hide")
  @RequireAdminPermission("content.publish")
  hideArticleLocale(@Param("id") id: string, @Param("locale", new ParseEnumPipe(Locale)) locale: Locale, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.articles.hide(admin, id, locale, request.requestId);
  }

  @Post("articles/:id/locales/:locale/archive")
  @RequireAdminPermission("content.archive")
  archiveArticleLocale(@Param("id") id: string, @Param("locale", new ParseEnumPipe(Locale)) locale: Locale, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.articles.archive(admin, id, locale, request.requestId);
  }

  // --- Versions ----------------------------------------------------------

  @Get("articles/:id/locales/:locale/versions")
  @RequireAdminPermission("content.view")
  listVersions(@Param("id") id: string, @Param("locale", new ParseEnumPipe(Locale)) locale: Locale) {
    return this.versions.list(id, locale);
  }

  @Get("content-versions/:versionId")
  @RequireAdminPermission("content.view")
  getVersion(@Param("versionId") versionId: string) {
    return this.versions.get(versionId);
  }

  @Post("content-versions/:versionId/restore")
  @RequireAdminPermission("content.edit")
  restoreVersion(@Param("versionId") versionId: string, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.versions.restore(admin, versionId, request.requestId);
  }

  // --- Categories ----------------------------------------------------------

  @Get("categories")
  @RequireAdminPermission("content.view")
  listCategories() {
    return this.categories.list();
  }

  @Post("categories")
  @RequireAdminPermission("content.create")
  createCategory(@Body() dto: SaveCategoryDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.categories.create(admin, dto.locales, request.requestId);
  }

  @Patch("categories/:id")
  @RequireAdminPermission("content.edit")
  updateCategory(@Param("id") id: string, @Body() dto: SaveCategoryDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.categories.update(admin, id, dto.locales, request.requestId);
  }

  // --- Tags ----------------------------------------------------------

  @Get("tags")
  @RequireAdminPermission("content.view")
  listTags() {
    return this.tags.list();
  }

  @Post("tags")
  @RequireAdminPermission("content.create")
  createTag(@Body() dto: SaveTagDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.tags.create(admin, dto.locales, request.requestId);
  }

  @Patch("tags/:id")
  @RequireAdminPermission("content.edit")
  updateTag(@Param("id") id: string, @Body() dto: SaveTagDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.tags.update(admin, id, dto.locales, request.requestId);
  }

  // --- Authors ----------------------------------------------------------

  @Get("authors")
  @RequireAdminPermission("content.view")
  listAuthors() {
    return this.authors.list();
  }

  @Post("authors")
  @RequireAdminPermission("content.create")
  createAuthor(@Body() dto: ContentAuthorInputDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.authors.create(admin, dto, request.requestId);
  }

  @Patch("authors/:id")
  @RequireAdminPermission("content.edit")
  updateAuthor(@Param("id") id: string, @Body() dto: UpdateContentAuthorDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.authors.update(admin, id, dto, request.requestId);
  }

  // --- Media ----------------------------------------------------------

  @Post("media/upload-url")
  @RequireAdminPermission("content.media.manage")
  requestMediaUpload(@Body() dto: RequestMediaUploadDto) {
    return this.media.requestUpload(dto.contentType);
  }

  @Post("media")
  @RequireAdminPermission("content.media.manage")
  confirmMediaUpload(@Body() dto: ConfirmMediaUploadDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.media.confirm(admin, dto, request.requestId);
  }

  @Get("media")
  @RequireAdminPermission("content.view")
  listMedia(@Query() query: PaginationQueryDto) {
    return this.media.list(query);
  }

  @Get("media/:id")
  @RequireAdminPermission("content.view")
  getMedia(@Param("id") id: string) {
    return this.media.get(id);
  }

  @Patch("media/:id")
  @RequireAdminPermission("content.media.manage")
  updateMedia(@Param("id") id: string, @Body() dto: UpdateMediaMetadataDto) {
    return this.media.updateMetadata(id, dto);
  }

  @Post("media/:id/disable")
  @RequireAdminPermission("content.media.manage")
  disableMedia(@Param("id") id: string, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.media.disable(admin, id, request.requestId);
  }

  // --- Placements ----------------------------------------------------------

  @Get("placements")
  @RequireAdminPermission("content.view")
  listPlacements() {
    return this.placements.listAll();
  }

  @Get("placements/:key")
  @RequireAdminPermission("content.view")
  getPlacement(@Param("key", new ParseEnumPipe(ContentPlacementKey)) key: ContentPlacementKey) {
    return this.placements.get(key);
  }

  @Put("placements/:key")
  @RequireAdminPermission("content.edit")
  replacePlacementBlocks(@Param("key", new ParseEnumPipe(ContentPlacementKey)) key: ContentPlacementKey, @Body() dto: ReplaceContentBlocksDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.placements.replaceBlocks(admin, key, dto.blocks, request.requestId);
  }
}
