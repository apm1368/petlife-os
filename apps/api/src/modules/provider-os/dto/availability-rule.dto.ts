import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityRuleDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN)
  startLocalTime!: string;

  @Matches(TIME_PATTERN)
  endLocalTime!: string;

  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  effectiveUntil?: string;

  @IsString()
  timezone!: string;
}

export class UpdateAvailabilityRuleDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string | null;

  @IsOptional()
  @IsUUID()
  serviceId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @Matches(TIME_PATTERN)
  startLocalTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  endLocalTime?: string;

  @IsOptional()
  @IsString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsString()
  effectiveUntil?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string;
}
