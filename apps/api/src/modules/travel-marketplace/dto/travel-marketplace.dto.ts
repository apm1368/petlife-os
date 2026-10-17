import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  Length,
  Matches,
  Max,
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
import { PaymentProvider, TravelBookingMode, TravelListingStatus, TravelListingType, TravelPricingMode } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsObjectKeyFor } from "../../../common/storage-keys/object-key.validator";

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
  @IsObjectKeyFor(["travel-listing-images"])
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

  /** Batch 5 */
  @IsOptional() @IsString() @MaxLength(120) province?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) checkInFrom?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) checkOutUntil?: string;
  @IsOptional() @IsString() @MaxLength(2000) houseRules?: string;
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
  @IsObjectKeyFor(["travel-listing-images"])
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

  /** Batch 5 */
  @IsOptional() @IsString() @MaxLength(120) province?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) checkInFrom?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) checkOutUntil?: string;
  @IsOptional() @IsString() @MaxLength(2000) houseRules?: string;
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

  /** Batch 5 */
  @IsOptional() @IsString() @MaxLength(200) bedInfo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5000) sizeSqm?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(20) maxPets?: number;
  @IsOptional() @IsString() @MaxLength(1000) petNotes?: string;
}

export class UpdateTravelInventoryUnitDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxOccupancy?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) basePriceIrr?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;

  /** Batch 5 */
  @IsOptional() @IsString() @MaxLength(200) bedInfo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5000) sizeSqm?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(20) maxPets?: number;
  @IsOptional() @IsString() @MaxLength(1000) petNotes?: string;
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

// --------------------------------------------------------------------------
// Batch 5
// --------------------------------------------------------------------------

const toBool = ({ value }: { value: unknown }) => value === true || value === "true" || value === "1";
const toList = ({ value }: { value: unknown }) => (Array.isArray(value) ? value : typeof value === "string" && value ? value.split(",") : undefined);

export const TRAVEL_SORTS = ["RECOMMENDED", "PRICE_ASC", "PRICE_DESC", "RATING", "DISTANCE", "BEST_PET_MATCH"] as const;

export class TravelSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) province?: string;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) guests?: number;
  /** Anonymous pet shape (never a private pet id in a public URL). */
  @IsOptional() @IsIn(["DOG", "CAT", "OTHER"]) species?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) petCount?: number;
  @IsOptional() @Type(() => Number) @Min(0.5) @Max(120) petWeightKg?: number;
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(5) @IsUUID("all", { each: true }) petIds?: string[];
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsEnum(TravelListingType, { each: true }) types?: TravelListingType[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @Min(1) @Max(5) minRating?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() verified?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() noPetFee?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() freeCancellation?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() instantBooking?: boolean;
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) amenities?: string[];
  @IsOptional() @Type(() => Number) @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @Min(-180) @Max(180) lng?: number;
  @IsOptional() @Type(() => Number) @Min(1) @Max(500) radiusKm?: number;
  @IsOptional() @IsIn(TRAVEL_SORTS as unknown as string[]) sort?: (typeof TRAVEL_SORTS)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) pageSize?: number;
}

export class TravelQuoteV2QueryDto {
  @IsUUID() unitId!: string;
  @IsOptional() @IsUUID() ratePlanId?: string;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(5) @IsUUID("all", { each: true }) petIds?: string[];
}

export class TravelCompareQueryDto {
  @Transform(toList) @IsArray() @ArrayMinSize(2) @ArrayMaxSize(3) @IsUUID("all", { each: true }) ids!: string[];
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
}

export class HoldTravelBookingDto {
  @IsUUID() listingId!: string;
  @IsUUID() unitId!: string;
  @IsOptional() @IsUUID() ratePlanId?: string;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsUUID("all", { each: true }) petIds?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(20) guests?: number;
}

export class SubmitTravelBookingDto {
  @IsOptional() @IsString() @MaxLength(1000) travelerNote?: string;
  @IsOptional() @IsUUID() tripId?: string;
  @IsOptional() @IsBoolean() acknowledgeMissingInfo?: boolean;
}

export class PayTravelBookingDto {
  @IsOptional() @IsEnum(PaymentProvider) provider?: PaymentProvider;
  @IsOptional() @IsIn(["SUCCESS", "FAILURE", "PENDING"]) mode?: string;
}

export class ModifyTravelBookingDto {
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsUUID() ratePlanId?: string;
}

export class TravelReviewInputDto {
  @IsInt() @Min(1) @Max(5) overall!: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) petFriendliness?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) cleanliness?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) location?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) accuracy?: number;
  @IsOptional() @IsString() @MaxLength(2000) body?: string;
}

export class ShareTravelDocumentDto {
  @IsUUID() medicalDocumentId!: string;
  @IsIn(["VACCINATION_PROOF", "HEALTH_CERTIFICATE", "OTHER_REQUIRED_BY_PROPERTY"]) purpose!: string;
}

export class TravelBookingListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsIn(["upcoming", "past"]) scope?: string;
}

export class ProviderNoteDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ProviderReasonDto {
  @IsString() @Length(3, 1000) reason!: string;
}

export class RatePlanInputDto {
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsInt() @Min(-90) @Max(200) priceModifierPercent?: number;
  @IsOptional() @IsIn(["FREE_UNTIL", "PARTIAL", "NON_REFUNDABLE"]) cancellationType?: "FREE_UNTIL" | "PARTIAL" | "NON_REFUNDABLE";
  @IsOptional() @IsInt() @Min(0) @Max(365) freeCancellationDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) lateRefundPercent?: number;
  @IsOptional() @IsIn(["PAY_NOW", "DEPOSIT", "PAY_AT_PROPERTY"]) paymentTiming?: "PAY_NOW" | "DEPOSIT" | "PAY_AT_PROPERTY";
  @IsOptional() @IsInt() @Min(1) @Max(100) depositPercent?: number;
  @IsOptional() @IsBoolean() includesBreakfast?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) includedItems?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(60) minNights?: number;
  @IsOptional() @IsDateString() activeFrom?: string;
  @IsOptional() @IsDateString() activeUntil?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TravelMediaInputDto {
  /** Repository-owned path (/images/...) or an https URL produced by PET LIFE storage. */
  @IsString() @Matches(/^(\/images\/[\w\-/.]+|https:\/\/[\w\-.]+\/[\w\-/.%]+)$/) url!: string;
  @IsOptional() @IsString() @MaxLength(200) alt?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) sortOrder?: number;
}

export class ReviewResponseDto {
  @IsString() @Length(3, 1000) response!: string;
}

export class CalendarQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

export class FinanceQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
