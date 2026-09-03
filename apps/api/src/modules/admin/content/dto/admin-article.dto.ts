import { ArticleLifecycleStatus, Locale } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { SLUG_PATTERN } from "../../../content/slug.util";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListArticlesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ArticleLifecycleStatus)
  status?: ArticleLifecycleStatus;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  authorId?: string;
}

export class SaveArticleLocaleDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @Matches(SLUG_PATTERN)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsArray()
  body!: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

export class CreateArticleDto extends SaveArticleLocaleDto {
  @IsEnum(Locale)
  locale!: Locale;

  @IsOptional()
  @IsUUID()
  authorId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  coverMediaAssetId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  tagIds?: string[];
}

export class UpdateArticleDto {
  @IsOptional()
  @IsUUID()
  authorId?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  coverMediaAssetId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  tagIds?: string[];
}
