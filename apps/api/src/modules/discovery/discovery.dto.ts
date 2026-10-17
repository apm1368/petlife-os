import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export const DISCOVERY_SORTS = ["RECOMMENDED", "EARLIEST", "NEAREST", "TOP_RATED", "LOWEST_PRICE"] as const;
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];

export class DiscoverProvidersDto {
  @IsOptional() @IsIn(["VET", "GROOMING", "TRAINING", "WALKING", "SITTING", "BOARDING", "PET_TAXI", "OTHER"]) category?: string;
  /** A clinical specialty expressed as a real service type (LAB_TEST, IMAGING_STUDY, DENTAL_CARE, ...). */
  @IsOptional() @IsString() @MaxLength(40) serviceType?: string;
  @IsOptional() @IsString() @MaxLength(80) specialty?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @IsIn(["DOG", "CAT"]) species?: "DOG" | "CAT";
  @IsOptional() @IsIn(["true"]) homeVisit?: "true";
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) minRating?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  /** Only providers with at least one open slot on this calendar date (provider timezone). */
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) radiusKm?: number;
  @IsOptional() @IsIn(DISCOVERY_SORTS) sort?: DiscoverySort;
}

export class ProviderIdParam {
  @IsUUID() providerId!: string;
}
