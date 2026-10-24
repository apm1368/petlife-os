import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PlaceReportStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { AdminAuthedRequest } from "../auth/admin-context.types";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { PetFriendlyPlaceService } from "../../places/pet-friendly-place.service";
import {
  CreatePetFriendlyPlaceDto,
  ListPetFriendlyPlacesQueryDto,
  RequestPetFriendlyPlaceImageUploadDto,
  SetPetFriendlyPlaceListedDto,
  SetPetFriendlyPlaceVerificationStatusDto,
  UpdatePetFriendlyPlaceDto,
  ResolvePlaceReportDto,
} from "../../places/dto/places.dto";

@Controller("admin/places")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPlacesController {
  constructor(
    private readonly places: PetFriendlyPlaceService,
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  /** Batch 5 — user reports about outdated/wrong place data (declared before :placeId routes). */
  @Get("reports")
  @RequireAdminPermission("places.view")
  async reports(@Query("status") status?: string) {
    const rows = await this.prisma.placeReport.findMany({
      where: { status: status && status in PlaceReportStatus ? (status as PlaceReportStatus) : PlaceReportStatus.OPEN },
      include: { place: { select: { id: true, name: true, city: true, category: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    return rows.map((r) => ({ id: r.id, place: r.place, reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt.toISOString() }));
  }

  @Post("reports/:reportId/resolve")
  @RequireAdminPermission("places.manage")
  async resolveReport(@Param("reportId", ParseUUIDPipe) reportId: string, @Body() dto: ResolvePlaceReportDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() req: AdminAuthedRequest) {
    const res = await this.prisma.placeReport.updateMany({ where: { id: reportId, status: PlaceReportStatus.OPEN }, data: { status: dto.status, resolvedByAdminId: admin.adminUserId } });
    if (res.count === 0) throw new NotFoundApiException("Open report");
    await this.audit.record({ adminUserId: admin.adminUserId, action: dto.status === "RESOLVED" ? "place_report.resolved" : "place_report.dismissed", entityType: "PLACE_REPORT", entityId: reportId, reason: dto.note, requestId: req.requestId });
    return { id: reportId, status: dto.status };
  }

  @Get()
  @RequireAdminPermission("places.view")
  list(@Query() query: ListPetFriendlyPlacesQueryDto) {
    return this.places.adminList(query);
  }

  @Get(":placeId")
  @RequireAdminPermission("places.view")
  get(@Param("placeId") placeId: string) {
    return this.places.adminGet(placeId);
  }

  @Post()
  @RequireAdminPermission("places.manage")
  create(@Body() dto: CreatePetFriendlyPlaceDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.create(admin, dto);
  }

  @Patch(":placeId")
  @RequireAdminPermission("places.manage")
  update(@Param("placeId") placeId: string, @Body() dto: UpdatePetFriendlyPlaceDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.update(admin, placeId, dto);
  }

  @Post(":placeId/verification")
  @RequireAdminPermission("places.manage")
  setVerification(@Param("placeId") placeId: string, @Body() dto: SetPetFriendlyPlaceVerificationStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.setVerificationStatus(admin, placeId, dto);
  }

  @Post(":placeId/listing")
  @RequireAdminPermission("places.manage")
  setListed(@Param("placeId") placeId: string, @Body() dto: SetPetFriendlyPlaceListedDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.setPubliclyListed(admin, placeId, dto);
  }

  @Post(":placeId/image-upload-url")
  @RequireAdminPermission("places.manage")
  requestImageUpload(@Param("placeId") placeId: string, @Body() dto: RequestPetFriendlyPlaceImageUploadDto) {
    return this.places.requestImageUpload(placeId, dto.contentType, dto.fileSizeBytes);
  }
}
