import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { TravelBookingMode, TravelListingStatus, TravelListingType, TravelPricingMode } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

// --- Provider: listings -----------------------------------------------------

export class CreateTravelListingDto {
  @IsEnum(TravelListingType)
  type!: TravelListingType;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(6000)
  description!: string;

  @IsString()
  @MinLength(2)
  country!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  imageObjectKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsEnum(TravelPricingMode)
  pricingMode?: TravelPricingMode;

  @IsOptional()
  @IsEnum(TravelBookingMode)
  bookingMode?: TravelBookingMode;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationPolicy?: string;
}

export class UpdateTravelListingDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(6000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  imageObjectKeys?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsEnum(TravelBookingMode)
  bookingMode?: TravelBookingMode;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationPolicy?: string;
}

/**
 * Every field here is the provider's own assertion about their property. The
 * API never derives a pet rule of its own, so all of these are optional and
 * an omitted field stays "not stated".
 */
export class UpsertTravelPetPolicyDto {
  @IsOptional() @IsBoolean() dogsAllowed?: boolean;
  @IsOptional() @IsBoolean() catsAllowed?: boolean;
  @IsOptional() @IsBoolean() otherAllowed?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPets?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxWeightKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minWeightKg?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  breedRestrictions?: string[];

  @IsOptional() @IsBoolean() vaccinationRequired?: boolean;
  @IsOptional() @IsBoolean() healthCertificateRequired?: boolean;
  @IsOptional() @IsBoolean() carrierRequired?: boolean;
  @IsOptional() @IsBoolean() leashRequired?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) petFeeIrr?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) depositIrr?: number;

  @IsOptional() @IsString() @MaxLength(1000) restrictedAreas?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

// --- Provider: inventory ----------------------------------------------------

export class CreateTravelInventoryUnitDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Interchangeable stock: 3 identical rooms is quantity 3, not 3 unit rows. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxOccupancy?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePriceIrr!: number;
}

export class UpdateTravelInventoryUnitDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxOccupancy?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) basePriceIrr?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** A provider's per-date override: block the date, reprice it, or both. */
export class SetTravelAvailabilityDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceIrr?: number;
}

// --- Public search / availability ------------------------------------------

export class SearchTravelListingsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsEnum(TravelListingType) type?: TravelListingType;
  @IsOptional() @IsString() search?: string;

  /** When both dates are given, results are filtered to listings with at least one unit actually free for the whole range. */
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) guests?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPriceIrr?: number;

  /** Filters to listings whose provider-stated policy accepts the species. */
  @IsOptional() @IsBoolean() @Type(() => Boolean) dogsAllowed?: boolean;
  @IsOptional() @IsBoolean() @Type(() => Boolean) catsAllowed?: boolean;
}

export class TravelAvailabilityQueryDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;
}

export class TravelQuoteQueryDto {
  @IsUUID()
  unitId!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  petCount?: number;
}

// --- Traveller: bookings ----------------------------------------------------

export class CreateTravelBookingDto {
  @IsUUID()
  unitId!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;

  /** The household's pets travelling. Validated against the provider's stated pet policy. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  petIds?: string[];

  @IsOptional()
  @IsUUID()
  tripId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  travelerNote?: string;
}

export class CancelTravelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RespondToTravelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  providerNote?: string;
}

export class ListTravelBookingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class AttachTravelBookingToTripDto {
  @IsUUID()
  tripId!: string;
}

// --- Admin moderation -------------------------------------------------------

export class ModerateTravelListingDto {
  @IsEnum(TravelListingStatus)
  status!: TravelListingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SetTravelListingVerificationDto {
  @IsBoolean()
  isVerified!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class TravelListingImageUploadDto {
  @IsString()
  contentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}
