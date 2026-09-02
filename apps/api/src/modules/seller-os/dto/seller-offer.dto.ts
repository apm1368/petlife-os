import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID, Min } from "class-validator";
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
}
