import { IsEnum, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { ObservationCategory, ObservationMediaType } from "@petlife/types";

export class RequestObservationMediaUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

/** These are OWNER OBSERVATIONS, never diagnoses (spec: "UI must make this distinction clear") — there is deliberately no "diagnosis" or "severity" field here. */
export class CreatePetObservationDto {
  @IsEnum(ObservationCategory)
  category!: ObservationCategory;

  @IsString()
  @Length(1, 2000)
  description!: string;

  @IsString()
  observedAt!: string;

  @IsOptional()
  @IsString()
  mediaKey?: string;

  @IsOptional()
  @IsEnum(ObservationMediaType)
  mediaType?: ObservationMediaType;

  @IsOptional()
  @IsString()
  mediaMimeType?: string;
}
