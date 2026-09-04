import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { AnimalSupportOrgType, AnimalSupportVerificationStatus, CampaignFundType, RescueCaseStatus, SupportCampaignStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class CreateAnimalSupportOrganizationDto {
  @IsEnum(AnimalSupportOrgType)
  type!: AnimalSupportOrgType;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}

export class UpdateAnimalSupportOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  logoObjectKey?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageObjectKeys?: string[];
}

export class SetAnimalSupportVerificationStatusDto {
  @IsEnum(AnimalSupportVerificationStatus)
  verificationStatus!: AnimalSupportVerificationStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetAnimalSupportListedDto {
  @IsBoolean()
  isPubliclyListed!: boolean;
}

export class ListAnimalSupportOrganizationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AnimalSupportVerificationStatus)
  verificationStatus?: AnimalSupportVerificationStatus;

  @IsOptional()
  @IsString()
  q?: string;
}

export class CreateRescueCaseDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  animalType?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedNeedIrr?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceObjectKeys?: string[];
}

export class UpdateRescueCaseStatusDto {
  @IsEnum(RescueCaseStatus)
  status!: RescueCaseStatus;
}

export class ListRescueCasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RescueCaseStatus)
  status?: RescueCaseStatus;

  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class RequestAnimalSupportMediaUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

// -- Campaigns ---------------------------------------------------------

export class CreateSupportCampaignDto {
  @IsOptional()
  @IsUUID()
  rescueCaseId?: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(CampaignFundType)
  fundType!: CampaignFundType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetAmountIrr?: number;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

export class UpdateSupportCampaignStatusDto {
  @IsEnum(SupportCampaignStatus)
  status!: SupportCampaignStatus;
}

export class PostSupportCampaignUpdateDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceObjectKeys?: string[];
}

export class ListSupportCampaignsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  rescueCaseId?: string;

  @IsOptional()
  @IsEnum(SupportCampaignStatus)
  status?: SupportCampaignStatus;
}

// -- Donations -----------------------------------------------------------

export class CreateDonationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  amountIrr!: number;

  @IsOptional()
  @IsBoolean()
  showDonorPublicly?: boolean;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RefundDonationDto {
  @IsString()
  reason!: string;
}

export class RecordDonationPayoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountIrr!: number;

  @IsEnum(CampaignFundType)
  fundType!: CampaignFundType;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListDonationHistoryQueryDto extends PaginationQueryDto {}

export class ListPublicDonationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
