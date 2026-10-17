import { PetSpecies } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

const toBool = ({ value }: { value: unknown }) => (value === "true" || value === true ? true : value === "false" || value === false ? false : undefined);

export class SearchProductsDto {
  @IsOptional() @IsUUID() category?: string;
  @IsOptional() @IsEnum(PetSpecies) species?: PetSpecies;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() petId?: string;
  @IsOptional() @IsUUID() brand?: string;
  @IsOptional() @IsUUID() seller?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() inStock?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() onPromotion?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) minRating?: number;
  /** Structured variant attributes, sent as attr[size]=10kg — never matched against description text. */
  @IsOptional() @IsObject() attr?: Record<string, string>;
  @IsOptional() @IsIn(["RECOMMENDED", "NEWEST", "PRICE_ASC", "PRICE_DESC", "TOP_RATED"]) sort?: "RECOMMENDED" | "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "TOP_RATED";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) pageSize?: number;
}

export class GetProductDetailDto {
  @IsOptional()
  @IsUUID()
  petId?: string;
}
