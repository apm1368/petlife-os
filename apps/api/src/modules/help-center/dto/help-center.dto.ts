import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import { HelpArticleStatus, LegalDocumentKind, Locale, SystemIncidentImpact, SystemIncidentStatus } from "@prisma/client";

export class LocaleQueryDto {
  @IsEnum(Locale) locale!: Locale;
}

export class ListHelpArticlesQueryDto extends LocaleQueryDto {
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(120) contextKey?: string;
  /** "true" / "1" restricts to FAQ entries (query-string booleans arrive as strings). */
  @IsOptional() @IsString() faq?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class SearchHelpQueryDto extends LocaleQueryDto {
  @IsString() @Length(1, 120) q!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class HelpVoteDto {
  @IsBoolean() helpful!: boolean;
}

export class EscalateDto {
  @IsString() @Length(5, 1000) reason!: string;
  /** Must be literally true: the server refuses an unconfirmed hand-off. */
  @IsBoolean() confirm!: boolean;
}

// ---- admin

export class CreateHelpCategoryDto {
  @IsString() @Length(1, 80) slug!: string;
  @IsString() @Length(1, 120) titleFa!: string;
  @IsOptional() @IsString() @MaxLength(120) titleEn?: string;
  @IsOptional() @IsString() @MaxLength(500) descriptionFa?: string;
  @IsOptional() @IsString() @MaxLength(500) descriptionEn?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateHelpCategoryDto {
  @IsOptional() @IsString() @Length(1, 120) titleFa?: string;
  @IsOptional() @IsString() @MaxLength(120) titleEn?: string;
  @IsOptional() @IsString() @MaxLength(500) descriptionFa?: string;
  @IsOptional() @IsString() @MaxLength(500) descriptionEn?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SaveHelpArticleDto {
  @IsUUID() categoryId!: string;
  @IsEnum(Locale) locale!: Locale;
  @IsString() @Length(1, 120) slug!: string;
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsString() @Length(1, 50_000) body!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) contextKeys?: string[];
  @IsOptional() @IsBoolean() isFaq?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsString() @MaxLength(300) changeNote?: string;
}

export class AdminListHelpArticlesQueryDto {
  @IsOptional() @IsEnum(Locale) locale?: Locale;
  @IsOptional() @IsEnum(HelpArticleStatus) status?: HelpArticleStatus;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

export class PublishHelpArticleDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
}

export class RollbackHelpArticleDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class SaveLegalVersionDto {
  @IsEnum(LegalDocumentKind) kind!: LegalDocumentKind;
  @IsEnum(Locale) locale!: Locale;
  @IsString() @Length(1, 200) title!: string;
  @IsString() @Length(1, 200_000) body!: string;
  @IsDateString() effectiveAt!: string;
  @IsOptional() @IsString() @MaxLength(300) changeNote?: string;
}

export class PublishLegalDto {
  @IsEnum(LegalDocumentKind) kind!: LegalDocumentKind;
  @IsEnum(Locale) locale!: Locale;
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}

export class UnpublishLegalDto {
  @IsEnum(LegalDocumentKind) kind!: LegalDocumentKind;
  @IsEnum(Locale) locale!: Locale;
}

export class OpenIncidentDto {
  @IsString() @Length(1, 200) title!: string;
  @IsEnum(SystemIncidentImpact) impact!: SystemIncidentImpact;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(80, { each: true }) components?: string[];
  @IsString() @Length(1, 2000) body!: string;
}

export class UpdateIncidentDto {
  @IsEnum(SystemIncidentStatus) status!: SystemIncidentStatus;
  @IsString() @Length(1, 2000) body!: string;
  @IsOptional() @IsEnum(SystemIncidentImpact) impact?: SystemIncidentImpact;
}

export class ScheduleMaintenanceDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}
