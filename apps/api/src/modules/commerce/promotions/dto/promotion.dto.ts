import { PartialType } from "@nestjs/mapped-types";
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from "class-validator";
import { PromotionStatus } from "@prisma/client";

export class PromotionInputDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsIn(["PERCENT", "FIXED"])
  discountType!: "PERCENT" | "FIXED";

  @IsInt()
  @Min(1)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscountAmount?: number | null;

  @IsIn(["ALL", "CATEGORY", "PRODUCT", "SELLER", "SERVICE"])
  scope!: "ALL" | "CATEGORY" | "PRODUCT" | "SELLER" | "SERVICE";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("all", { each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  sellerOrganizationIds?: string[];

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;
}

export class UpdatePromotionDto extends PartialType(PromotionInputDto) {}

export class PromotionTransitionDto {
  @IsIn([PromotionStatus.ACTIVE, PromotionStatus.PAUSED, PromotionStatus.ENDED])
  status!: PromotionStatus;
}

export class ListPromotionsQueryDto {
  @IsOptional()
  @IsEnum(PromotionStatus)
  status?: PromotionStatus;
}
