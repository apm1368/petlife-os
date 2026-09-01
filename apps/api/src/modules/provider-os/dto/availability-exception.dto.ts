import { AvailabilityExceptionType } from "@prisma/client";
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateAvailabilityExceptionDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;

  @IsISO8601()
  startAt!: string;

  @IsISO8601()
  endAt!: string;

  @IsEnum(AvailabilityExceptionType)
  type!: AvailabilityExceptionType;

  @IsOptional()
  @IsString()
  reason?: string;

  /** Required to proceed when a BLOCKED exception would conflict with existing confirmed bookings — see AvailabilityConflictException. */
  @IsOptional()
  @IsBoolean()
  acknowledgeConflict?: boolean;
}

export class UpdateAvailabilityExceptionDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string | null;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsEnum(AvailabilityExceptionType)
  type?: AvailabilityExceptionType;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsBoolean()
  acknowledgeConflict?: boolean;
}
