import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { IsObjectKeyFor } from "../../common/storage-keys/object-key.validator";

export class PutIntakeFormDto {
  /** 1–15 structured questions; validated by validateIntakeQuestions (no HTML). An empty form is removed with DELETE. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) questions!: unknown[];
}

export class AttachmentUploadUrlDto {
  @IsIn(["application/pdf", "image/jpeg", "image/png", "image/webp"]) contentType!: string;
  @IsInt() @Min(1) @Max(20 * 1024 * 1024) fileSizeBytes!: number;
}

export class AttachBookingFileDto {
  @IsObjectKeyFor(["booking-attachments"]) key!: string;
  @IsIn(["application/pdf", "image/jpeg", "image/png", "image/webp"]) mimeType!: string;
  @IsInt() @Min(1) @Max(20 * 1024 * 1024) sizeBytes!: number;
  @IsOptional() @IsString() @Length(1, 120) title?: string;
}
