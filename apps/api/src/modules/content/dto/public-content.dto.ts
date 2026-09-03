import { Locale } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class ListPublicArticlesQueryDto extends PaginationQueryDto {
  @IsEnum(Locale)
  locale!: Locale;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @IsString()
  tagSlug?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class LocaleQueryDto {
  @IsEnum(Locale)
  locale!: Locale;
}
