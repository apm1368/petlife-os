import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { CommunityPostType, CommunityReactionType, CommunityReportReason, CommunityReportStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class CreateCommunityPostDto {
  @IsEnum(CommunityPostType)
  type!: CommunityPostType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsUUID()
  petId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaObjectKeys?: string[];
}

export class ListCommunityPostsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CommunityPostType)
  type?: CommunityPostType;

  /** spec: "MVP can remain simple. Do not build opaque algorithmic recommendation infrastructure" — a plain country-code filter is the entire "local feed" story this phase. */
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class CreateCommunityCommentDto {
  @IsString()
  @MaxLength(2000)
  body!: string;
}

export class SetCommunityReactionDto {
  @IsEnum(CommunityReactionType)
  type!: CommunityReactionType;
}

export class SubmitCommunityReportDto {
  @IsEnum(CommunityReportReason)
  reason!: CommunityReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ListCommunityReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CommunityReportStatus)
  status?: CommunityReportStatus;
}

export class EscalateCommunityReportDto {
  @IsString()
  reason!: string;
}

export class DismissCommunityReportDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RequestCommunityMediaUploadDto {
  @IsString()
  contentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}
