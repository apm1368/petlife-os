import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { InsuranceCoverageType, InsuranceVerificationStatus, PetSpecies } from "@petlife/types";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

// -- Providers -------------------------------------------------------------

export class CreateInsuranceProviderDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  logoObjectKey?: string;
}

export class UpdateInsuranceProviderDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  logoObjectKey?: string;
}

export class SetInsuranceVerificationStatusDto {
  @IsEnum(InsuranceVerificationStatus)
  status!: InsuranceVerificationStatus;
}

export class SetInsuranceListedDto {
  @IsBoolean()
  isPubliclyListed!: boolean;
}

export class ListInsuranceProvidersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  country?: string;
}

// -- Products ----------------------------------------------------------------

export class CreateInsuranceProductDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsArray()
  @IsEnum(PetSpecies, { each: true })
  speciesEligibility!: PetSpecies[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minAgeMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAgeMonths?: number;

  @IsArray()
  @IsEnum(InsuranceCoverageType, { each: true })
  coverageTypes!: InsuranceCoverageType[];

  @IsString()
  @Length(1, 4000)
  coverageSummary!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  waitingPeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deductibleAmountIrr?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  annualLimitIrr?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  coinsurancePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  premiumMinIrr?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  premiumMaxIrr?: number;

  /** Spec hard UX rule: exclusions must be highly visible — always required, never optional, so a product can never be created without at least declaring an empty list explicitly. */
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  exclusions!: string[];

  @IsOptional()
  @IsString()
  @Length(0, 300)
  termsSource?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  termsUrl?: string;
}

export class UpdateInsuranceProductDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PetSpecies, { each: true })
  speciesEligibility?: PetSpecies[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minAgeMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAgeMonths?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(InsuranceCoverageType, { each: true })
  coverageTypes?: InsuranceCoverageType[];

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  coverageSummary?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  waitingPeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deductibleAmountIrr?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  annualLimitIrr?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  coinsurancePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  premiumMinIrr?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  premiumMaxIrr?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  exclusions?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 300)
  termsSource?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  termsUrl?: string;
}

export class ListInsuranceProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(PetSpecies)
  species?: PetSpecies;

  @IsOptional()
  @IsUUID()
  providerId?: string;
}

export class CompareInsuranceProductsQueryDto {
  /** Comma-separated product ids — kept as a single query param (never a body) since this is a GET comparison read. */
  @IsString()
  productIds!: string;
}

export class RequestInsuranceMediaUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

// -- Eligibility + Applications ---------------------------------------------

export class CreateInsuranceApplicationDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

export class UpdateInsuranceApplicationDto {
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}
