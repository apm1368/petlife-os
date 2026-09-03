import { IsIn, IsInt, IsOptional, IsString, Min, MaxLength } from "class-validator";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class RequestMediaUploadDto {
  @IsIn(ALLOWED_MIME_TYPES)
  contentType!: string;
}

export class ConfirmMediaUploadDto {
  @IsString()
  key!: string;

  @IsString()
  url!: string;

  @IsIn(ALLOWED_MIME_TYPES)
  mimeType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  widthPx?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  heightPx?: number;
}

export class UpdateMediaMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  widthPx?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  heightPx?: number;
}
