import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { LegalDocumentKind, Locale } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { HelpCenterService } from "./help-center.service";
import { LegalStatusService } from "./legal-status.service";
import {
  AdminListHelpArticlesQueryDto,
  CreateHelpCategoryDto,
  OpenIncidentDto,
  PublishHelpArticleDto,
  PublishLegalDto,
  RollbackHelpArticleDto,
  SaveHelpArticleDto,
  SaveLegalVersionDto,
  ScheduleMaintenanceDto,
  UnpublishLegalDto,
  UpdateHelpCategoryDto,
  UpdateIncidentDto,
} from "./dto/help-center.dto";

/**
 * Admin side of the Help Center. Authorization reuses the EXISTING permission vocabulary — no new
 * permission, no role change: reading is content.view, drafting is content.create/edit, and making text
 * visible to readers is content.publish (held by ADMIN and CONTENT_ADMIN, deliberately NOT by EDITOR, so
 * "editing and publishing are separate actions" holds exactly as it does for the blog).
 */
@Controller("admin/help")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminHelpCenterController {
  constructor(private readonly help: HelpCenterService) {}

  @Get("categories")
  @RequireAdminPermission("content.view")
  categories() {
    return this.help.adminListCategories();
  }

  @Post("categories")
  @RequireAdminPermission("content.create")
  createCategory(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CreateHelpCategoryDto) {
    return this.help.adminCreateCategory(admin, dto);
  }

  @Patch("categories/:id")
  @RequireAdminPermission("content.edit")
  updateCategory(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateHelpCategoryDto) {
    return this.help.adminUpdateCategory(admin, id, dto);
  }

  @Get("articles")
  @RequireAdminPermission("content.view")
  articles(@Query() q: AdminListHelpArticlesQueryDto) {
    return this.help.adminListArticles(q);
  }

  @Get("articles/:id")
  @RequireAdminPermission("content.view")
  article(@Param("id", ParseUUIDPipe) id: string) {
    return this.help.adminGetArticle(id);
  }

  @Post("articles")
  @RequireAdminPermission("content.create")
  create(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: SaveHelpArticleDto) {
    return this.help.adminSaveArticle(admin, null, dto);
  }

  @Put("articles/:id")
  @RequireAdminPermission("content.edit")
  save(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SaveHelpArticleDto) {
    return this.help.adminSaveArticle(admin, id, dto);
  }

  @Post("articles/:id/publish")
  @RequireAdminPermission("content.publish")
  publish(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PublishHelpArticleDto) {
    return this.help.adminPublish(admin, id, dto.version);
  }

  @Post("articles/:id/unpublish")
  @RequireAdminPermission("content.publish")
  unpublish(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.help.adminUnpublish(admin, id);
  }

  @Get("articles/:id/versions")
  @RequireAdminPermission("content.view")
  versions(@Param("id", ParseUUIDPipe) id: string) {
    return this.help.adminListVersions(id);
  }

  @Post("articles/:id/rollback")
  @RequireAdminPermission("content.publish")
  rollback(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: RollbackHelpArticleDto) {
    return this.help.adminRollback(admin, id, dto.version);
  }
}

/** Admin legal documents: drafting needs content.edit, making a version the live text needs content.publish. */
@Controller("admin/legal")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminLegalController {
  constructor(private readonly legal: LegalStatusService) {}

  @Get()
  @RequireAdminPermission("content.view")
  list() {
    return this.legal.adminListDocuments();
  }

  @Get("versions")
  @RequireAdminPermission("content.view")
  versions(@Query("kind") kind: LegalDocumentKind, @Query("locale") locale: Locale) {
    return this.legal.adminListVersions(kind, locale);
  }

  @Post("versions")
  @RequireAdminPermission("content.edit")
  save(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: SaveLegalVersionDto) {
    return this.legal.adminSaveVersion(admin, dto);
  }

  @Post("publish")
  @RequireAdminPermission("content.publish")
  publish(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: PublishLegalDto) {
    return this.legal.adminPublish(admin, dto.kind, dto.locale, dto.version);
  }

  @Post("unpublish")
  @RequireAdminPermission("content.publish")
  unpublish(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: UnpublishLegalDto) {
    return this.legal.adminUnpublish(admin, dto.kind, dto.locale);
  }
}

/**
 * Admin status page. Declaring an incident or a maintenance window is an operations act, so it needs
 * support.manage (SUPPORT, SUPPORT_AGENT, ADMIN); reading needs only support.view.
 */
@Controller("admin/status")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminStatusController {
  constructor(private readonly legal: LegalStatusService) {}

  @Get("incidents")
  @RequireAdminPermission("support.view")
  incidents() {
    return this.legal.adminListIncidents();
  }

  @Post("incidents")
  @RequireAdminPermission("support.manage")
  open(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: OpenIncidentDto) {
    return this.legal.adminOpenIncident(admin, dto);
  }

  @Post("incidents/:id/updates")
  @RequireAdminPermission("support.manage")
  update(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateIncidentDto) {
    return this.legal.adminUpdateIncident(admin, id, dto);
  }

  @Get("maintenance")
  @RequireAdminPermission("support.view")
  maintenance() {
    return this.legal.adminListMaintenance();
  }

  @Post("maintenance")
  @RequireAdminPermission("support.manage")
  schedule(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: ScheduleMaintenanceDto) {
    return this.legal.adminScheduleMaintenance(admin, dto);
  }

  @Post("maintenance/:id/cancel")
  @RequireAdminPermission("support.manage")
  cancel(@CurrentAdmin() admin: ResolvedAdminContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.legal.adminCancelMaintenance(admin, id);
  }
}
