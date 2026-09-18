import { IsArray, IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator";
import { HelpOfferStatus, SupportNeedCategory, SupportNeedContactMode, SupportNeedStatus, SupportNeedUrgency } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class CreateSupportNeedListingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsEnum(SupportNeedCategory)
  category!: SupportNeedCategory;

  @IsOptional()
  @IsEnum(SupportNeedUrgency)
  urgency?: SupportNeedUrgency;

  @IsString()
  @MinLength(2)
  province!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  /** Approximate, neighbourhood-level only — never a precise home pin. */
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageObjectKeys?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  neededQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  quantityUnit?: string;

  /** Publishing on behalf of a verified organization instead of yourself. */
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  /** Only meaningful with a DONATE/BOTH contact mode — money always flows through this existing campaign's ledger. */
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsEnum(SupportNeedContactMode)
  contactMode?: SupportNeedContactMode;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  animalType?: string;
}

export class UpdateSupportNeedListingDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsEnum(SupportNeedCategory)
  category?: SupportNeedCategory;

  @IsOptional()
  @IsEnum(SupportNeedUrgency)
  urgency?: SupportNeedUrgency;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageObjectKeys?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  neededQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  quantityUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  animalType?: string;
}

/** Public discovery filters — Divar-style: category, urgency, location, free text. */
export class ListSupportNeedListingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupportNeedCategory)
  category?: SupportNeedCategory;

  @IsOptional()
  @IsEnum(SupportNeedUrgency)
  urgency?: SupportNeedUrgency;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

/** The publisher's own listings, filterable by status for the My Listings tabs. */
export class ListMySupportNeedListingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupportNeedStatus)
  status?: SupportNeedStatus;
}

export class CreateHelpOfferDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message!: string;

  @IsEnum(SupportNeedCategory)
  helpType!: SupportNeedCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class RespondToHelpOfferDto {
  /** ACCEPTED, DECLINED, COMPLETED or CANCELLED — validated against the explicit transition table in SupportNeedService. */
  @IsEnum(HelpOfferStatus)
  status!: HelpOfferStatus;

  /** Only read when moving to COMPLETED: how much of the need this offer actually satisfied. */
  @IsOptional()
  @IsInt()
  @Min(1)
  fulfilledQuantity?: number;
}

export class ReviewSupportNeedListingDto {
  @IsEnum(SupportNeedStatus)
  status!: SupportNeedStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

export class ListAdminSupportNeedListingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupportNeedStatus)
  status?: SupportNeedStatus;

  @IsOptional()
  @IsEnum(SupportNeedCategory)
  category?: SupportNeedCategory;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class RequestSupportNeedMediaUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}
