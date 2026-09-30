import { Body, Controller, createParamDecorator, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AnimalSupportOrgRole, HelpOfferStatus, SupportNeedStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { NgoAuthGuard, RequireNgoRole } from "./ngo-auth.guard";
import { NgoPortalService, type NgoContext } from "./ngo-portal.service";

const CurrentNgo = createParamDecorator((_: unknown, ctx: ExecutionContext): NgoContext => ctx.switchToHttp().getRequest<{ ngoContext: NgoContext }>().ngoContext);

class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
class NeedsQueryDto extends PageDto {
  @IsOptional() @IsEnum(SupportNeedStatus) status?: SupportNeedStatus;
}
class OffersQueryDto extends PageDto {
  @IsOptional() @IsEnum(HelpOfferStatus) status?: HelpOfferStatus;
  @IsOptional() @Transform(({ value }) => value === true || value === "true" || value === "1") @IsBoolean() volunteer?: boolean;
}
class AddMemberDto {
  @IsEmail() email!: string;
  @IsEnum(AnimalSupportOrgRole) role!: AnimalSupportOrgRole;
}
class UpdateMemberDto {
  @IsOptional() @IsEnum(AnimalSupportOrgRole) role?: AnimalSupportOrgRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class UploadDto {
  @IsString() contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) fileSizeBytes!: number;
}
class SubmitVerificationDto {
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) documentKeys!: string[];
}
class ProfileDto {
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsEmail() contactEmail?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(30) contactPhone?: string | null;
}

/** Batch 6 — the NGO / shelter / rescue staff portal. Needs and offers are managed through the regular animal-support endpoints, which authorize organization staff. */
@Controller("ngo")
@UseGuards(SessionAuthGuard, NgoAuthGuard)
export class NgoPortalController {
  constructor(private readonly portal: NgoPortalService) {}

  @Get("me")
  async me(@CurrentUser() user: SessionUser, @CurrentNgo() ctx: NgoContext) {
    return { current: ctx, memberships: await this.portal.memberships(user.id) };
  }

  @Get("overview")
  overview(@CurrentNgo() ctx: NgoContext) {
    return this.portal.overview(ctx);
  }

  @Get("needs")
  needs(@CurrentNgo() ctx: NgoContext, @Query() q: NeedsQueryDto) {
    return this.portal.needs(ctx, q);
  }

  @Get("offers")
  offers(@CurrentNgo() ctx: NgoContext, @Query() q: OffersQueryDto) {
    return this.portal.offers(ctx, q);
  }

  @Get("donations")
  donations(@CurrentNgo() ctx: NgoContext, @Query() q: PageDto) {
    return this.portal.donations(ctx, q);
  }

  @Get("team")
  team(@CurrentNgo() ctx: NgoContext) {
    return this.portal.team(ctx);
  }

  @Post("team")
  @RequireNgoRole(AnimalSupportOrgRole.OWNER)
  addMember(@CurrentNgo() ctx: NgoContext, @Body() dto: AddMemberDto) {
    return this.portal.addMember(ctx, dto.email, dto.role);
  }

  @Patch("team/:membershipId")
  @RequireNgoRole(AnimalSupportOrgRole.OWNER)
  updateMember(@CurrentNgo() ctx: NgoContext, @CurrentUser() user: SessionUser, @Param("membershipId", ParseUUIDPipe) membershipId: string, @Body() dto: UpdateMemberDto) {
    return this.portal.updateMember(ctx, user.id, membershipId, dto);
  }

  @Get("verification")
  verification(@CurrentNgo() ctx: NgoContext) {
    return this.portal.verification(ctx);
  }

  @Post("verification/upload-url")
  @RequireNgoRole(AnimalSupportOrgRole.OWNER)
  uploadUrl(@CurrentNgo() ctx: NgoContext, @Body() dto: UploadDto) {
    return this.portal.requestVerificationUpload(ctx, dto.contentType, dto.fileSizeBytes);
  }

  @Post("verification/submit")
  @RequireNgoRole(AnimalSupportOrgRole.OWNER)
  submit(@CurrentNgo() ctx: NgoContext, @CurrentUser() user: SessionUser, @Body() dto: SubmitVerificationDto) {
    return this.portal.submitVerification(ctx, user.id, dto.documentKeys);
  }

  @Patch("profile")
  @RequireNgoRole(AnimalSupportOrgRole.OWNER)
  profile(@CurrentNgo() ctx: NgoContext, @Body() dto: ProfileDto) {
    return this.portal.updateProfile(ctx, dto);
  }
}
