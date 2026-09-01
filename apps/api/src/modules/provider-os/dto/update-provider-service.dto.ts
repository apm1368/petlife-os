import { LocationMode } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

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
}
