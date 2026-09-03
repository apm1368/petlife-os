import { Type } from "class-transformer";
import { Locale } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { SLUG_PATTERN } from "../../../content/slug.util";

export class CategoryLocaleInputDto {
  @IsEnum(Locale)
  locale!: Locale;

  @IsString()
  @MaxLength(100)
  name!: string;

  @Matches(SLUG_PATTERN)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class SaveCategoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryLocaleInputDto)
  locales!: CategoryLocaleInputDto[];
}

export class TagLocaleInputDto {
  @IsEnum(Locale)
  locale!: Locale;

  @IsString()
  @MaxLength(50)
  name!: string;

  @Matches(SLUG_PATTERN)
  slug!: string;
}

export class SaveTagDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagLocaleInputDto)
  locales!: TagLocaleInputDto[];
}
