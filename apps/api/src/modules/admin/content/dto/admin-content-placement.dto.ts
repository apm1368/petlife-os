import { Type } from "class-transformer";
import { Locale } from "@prisma/client";
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, ValidateNested } from "class-validator";

export class ContentBlockLocaleInputDto {
  @IsEnum(Locale)
  locale!: Locale;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  heading?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaHref?: string;
}

export class ContentBlockInputDto {
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsOptional()
  @IsUUID()
  linkedArticleId?: string;

  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentBlockLocaleInputDto)
  locales!: ContentBlockLocaleInputDto[];
}

export class ReplaceContentBlocksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentBlockInputDto)
  blocks!: ContentBlockInputDto[];
}
