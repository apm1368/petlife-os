import { SubscriptionBillingInterval, SubscriptionEntitlementType, SubscriptionPlanPriceStatus, SubscriptionPlanStatus } from "@prisma/client";
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateIf } from "class-validator";

export class CreateAdminSubscriptionPlanDto {
  @IsString()
  code!: string;

  @IsString()
  nameFa!: string;

  @IsString()
  nameEn!: string;

  @IsOptional()
  @IsString()
  descriptionFa?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;

  /** Seeds SubscriptionPlanCountry rows — spec: "reuse CountryConfig for country-specific availability." */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  countryAvailability!: string[];
}

export class UpdateAdminSubscriptionPlanDto {
  @IsOptional()
  @IsString()
  nameFa?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  descriptionFa?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @IsEnum(SubscriptionPlanStatus)
  status?: SubscriptionPlanStatus;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countryAvailability?: string[];
}

/** One entitlement row per key — spec: "Support at least: BOOLEAN, LIMIT." A BOOLEAN row must set `boolValue`; a LIMIT row must set `limitValue` (`null` there means unlimited, so it is passed explicitly, never inferred from absence). */
export class UpsertAdminPlanEntitlementDto {
  @IsString()
  key!: string;

  @IsEnum(SubscriptionEntitlementType)
  type!: SubscriptionEntitlementType;

  @ValidateIf((o: UpsertAdminPlanEntitlementDto) => o.type === SubscriptionEntitlementType.BOOLEAN)
  @IsBoolean()
  boolValue?: boolean;

  @ValidateIf((o: UpsertAdminPlanEntitlementDto) => o.type === SubscriptionEntitlementType.LIMIT)
  @IsOptional()
  @IsInt()
  @Min(0)
  limitValue?: number | null;
}

export class CreateAdminSubscriptionPlanPriceDto {
  @IsString()
  countryCode!: string;

  @IsEnum(SubscriptionBillingInterval)
  billingInterval!: SubscriptionBillingInterval;

  /** Integer IRR — the sole financial source of truth (spec: "no floating point"). */
  @IsInt()
  @Min(0)
  amount!: number;
}

export class UpdateAdminSubscriptionPlanPriceStatusDto {
  @IsEnum(SubscriptionPlanPriceStatus)
  status!: SubscriptionPlanPriceStatus;
}

export class GrantEntitlementOverrideDto {
  @IsUUID()
  householdId!: string;

  @IsString()
  key!: string;

  @IsEnum(SubscriptionEntitlementType)
  type!: SubscriptionEntitlementType;

  @ValidateIf((o: GrantEntitlementOverrideDto) => o.type === SubscriptionEntitlementType.BOOLEAN)
  @IsBoolean()
  boolValue?: boolean;

  @ValidateIf((o: GrantEntitlementOverrideDto) => o.type === SubscriptionEntitlementType.LIMIT)
  @IsOptional()
  @IsInt()
  @Min(0)
  limitValue?: number | null;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
