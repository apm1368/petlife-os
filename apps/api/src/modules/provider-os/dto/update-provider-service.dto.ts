import { BookingMode, BookingPaymentMode, LocationMode, ProviderResourceType } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

/** Editable fields only (spec section 24) — category/type/organization/location are structural and never change via this endpoint. */
export class UpdateProviderServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceAmount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(24 * 60)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsDog?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsCat?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minAgeMonths?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxAgeMonths?: number | null;

  @IsOptional()
  @IsBoolean()
  requiresCareProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresHealthBasics?: boolean;

  @IsOptional()
  @IsEnum(LocationMode)
  locationMode?: LocationMode;

  /** Batch 3 booking policy — applies to future bookings only; confirmed bookings keep their snapshot. */
  @IsOptional()
  @IsEnum(BookingMode)
  bookingMode?: BookingMode;

  @IsOptional()
  @IsEnum(BookingPaymentMode)
  paymentMode?: BookingPaymentMode;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  depositAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  cancellationPolicy?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 14)
  freeCancellationHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  lateCancellationRefundPercent?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  preparationNotes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPetsPerBooking?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(ProviderResourceType)
  requiredResourceType?: ProviderResourceType | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  requestTtlHours?: number;
}
