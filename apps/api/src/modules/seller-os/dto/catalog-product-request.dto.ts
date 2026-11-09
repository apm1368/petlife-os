import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, IsUrl, IsUUID, Length, MaxLength } from "class-validator";

export class CreateCatalogProductRequestDto {
  @IsString() @Length(2, 180) requestedTitle!: string;
  @IsOptional() @IsString() @MaxLength(120) brandName?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsObject({ each: true }) specifications?: unknown[];
  @IsOptional() @IsUrl({ protocols: ["https", "http"], require_protocol: true }) @MaxLength(2048) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) sourceName?: string;
}
