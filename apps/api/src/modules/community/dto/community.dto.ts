import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from "class-validator";

export const COMMUNITY_TOPICS = ["DOGS", "CATS", "HEALTH", "TRAINING", "LOST_PETS", "TRAVEL", "ADOPTION", "NUTRITION", "OTHER"] as const;
import { CommunityPostType, CommunityReactionType, CommunityReportReason, CommunityReportStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsObjectKeyFor } from "../../../common/storage-keys/object-key.validator";

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
  @IsObjectKeyFor(["community-media"])
  mediaObjectKeys?: string[];

  /** Up to three topics from the fixed vocabulary. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(COMMUNITY_TOPICS, { each: true })
  topics?: (typeof COMMUNITY_TOPICS)[number][];

  /** Optional city name for the local feed — never a precise location. */
  @IsOptional()
  @IsString()
  @Length(1, 80)
  city?: string;
}

export class ListCommunityPostsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CommunityPostType)
  type?: CommunityPostType;

  /** spec: "MVP can remain simple. Do not build opaque algorithmic recommendation infrastructure" — a plain country-code filter is the entire "local feed" story this phase. */
  @IsOptional()
  @IsString()
  countryCode?: string;

  /** Batch 6 — plain title/body text search, no ranking infrastructure. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(COMMUNITY_TOPICS)
  topic?: (typeof COMMUNITY_TOPICS)[number];

  @IsOptional()
  @IsString()
  @Length(1, 80)
  city?: string;
}

export class CreateCommunityCommentDto {
  @IsString()
  @MaxLength(2000)
  body!: string;

  /** Reply to a top-level comment of the same post (one level only). */
  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
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

  @IsOptional()
  @IsIn(["COMMUNITY", "SUPPORT_NEED", "LOST_PET_INCIDENT", "LOST_PET_SIGHTING", "ORGANIZATION"])
  targetType?: "COMMUNITY" | "SUPPORT_NEED" | "LOST_PET_INCIDENT" | "LOST_PET_SIGHTING" | "ORGANIZATION";
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
