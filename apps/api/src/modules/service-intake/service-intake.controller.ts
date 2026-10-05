import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ProviderUserRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import { RequireProviderRole } from "../provider-os/auth/require-provider-role.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ServiceIntakeService } from "./service-intake.service";
import { AttachBookingFileDto, AttachmentUploadUrlDto, PutIntakeFormDto } from "./service-intake.dto";

/** Public: the active intake form a member answers when booking this service (null when the service has none). */
@Controller("provider-services/:serviceId/intake-form")
export class PublicIntakeFormController {
  constructor(private readonly intake: ServiceIntakeService) {}
  @Get()
  get(@Param("serviceId", ParseUUIDPipe) serviceId: string) {
    return this.intake.publicForm(serviceId);
  }
}

@Controller("bookings/:bookingId/attachments")
@UseGuards(SessionAuthGuard)
export class OwnerBookingAttachmentsController {
  constructor(private readonly intake: ServiceIntakeService) {}
  @Get()
  list(@CurrentUser() user: SessionUser, @Param("bookingId", ParseUUIDPipe) bookingId: string) {
    return this.intake.ownerList(user.id, bookingId);
  }
  @Post("upload-url")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  uploadUrl(@CurrentUser() user: SessionUser, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Body() dto: AttachmentUploadUrlDto) {
    return this.intake.ownerUploadUrl(user.id, bookingId, dto);
  }
  @Post()
  attach(@CurrentUser() user: SessionUser, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Body() dto: AttachBookingFileDto) {
    return this.intake.ownerAttach(user.id, bookingId, dto);
  }
  @Get(":attachmentId/download")
  download(@CurrentUser() user: SessionUser, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) {
    return this.intake.ownerDownload(user.id, bookingId, attachmentId);
  }
  @Delete(":attachmentId")
  remove(@CurrentUser() user: SessionUser, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) {
    return this.intake.ownerRemove(user.id, bookingId, attachmentId);
  }
}

@Controller("provider")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderIntakeController {
  constructor(private readonly intake: ServiceIntakeService) {}

  /** Replaces the service's intake form with a new version (bookings keep the version they answered). */
  @Put("services/:serviceId/intake-form")
  @RequireProviderRole(ProviderUserRole.OWNER)
  putForm(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("serviceId", ParseUUIDPipe) serviceId: string, @Body() dto: PutIntakeFormDto) {
    return this.intake.putForm(ctx, serviceId, dto.questions);
  }

  @Delete("services/:serviceId/intake-form")
  @RequireProviderRole(ProviderUserRole.OWNER)
  removeForm(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("serviceId", ParseUUIDPipe) serviceId: string) {
    return this.intake.removeForm(ctx, serviceId);
  }

  @Get("bookings/:bookingId/intake")
  bookingIntake(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("bookingId", ParseUUIDPipe) bookingId: string) {
    return this.intake.providerIntake(ctx, bookingId);
  }

  @Get("bookings/:bookingId/attachments")
  list(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("bookingId", ParseUUIDPipe) bookingId: string) {
    return this.intake.providerList(ctx, bookingId);
  }

  @Post("bookings/:bookingId/attachments/upload-url")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  uploadUrl(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Body() dto: AttachmentUploadUrlDto) {
    return this.intake.providerUploadUrl(ctx, bookingId, dto);
  }

  @Post("bookings/:bookingId/attachments")
  attach(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Body() dto: AttachBookingFileDto) {
    return this.intake.providerAttach(ctx, bookingId, dto);
  }

  @Get("bookings/:bookingId/attachments/:attachmentId/download")
  download(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) {
    return this.intake.providerDownload(ctx, bookingId, attachmentId);
  }
}
