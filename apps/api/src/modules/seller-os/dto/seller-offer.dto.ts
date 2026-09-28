import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from "class-validator";
import { SellerOfferStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class ListSellerOffersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SellerOfferStatus)
  status?: SellerOfferStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  lowStock?: boolean;
}

export class CreateSellerOfferDto {
  @IsUUID()
  productVariantId!: string;

  @IsInt()
  @IsPositive()
  priceAmount!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  compareAtAmount?: number;

  @IsOptional()
  @IsString()
  sellerSku?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialOnHand?: number;

  /** Batch 4 — repeat delivery participation; intervals are 7..180 days. */
  @IsOptional()
  @IsBoolean()
  repeatDeliveryEligible?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(7, { each: true })
  @Max(180, { each: true })
  repeatIntervalsDays?: number[];
}

export class UpdateSellerOfferDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  priceAmount?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  compareAtAmount?: number;

  @IsOptional()
  @IsString()
  sellerSku?: string;

  @IsOptional()
  @IsEnum(SellerOfferStatus)
  status?: SellerOfferStatus;

  /** Batch 4 — repeat delivery participation; intervals are 7..180 days. */
  @IsOptional()
  @IsBoolean()
  repeatDeliveryEligible?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(7, { each: true })
  @Max(180, { each: true })
  repeatIntervalsDays?: number[];
}
