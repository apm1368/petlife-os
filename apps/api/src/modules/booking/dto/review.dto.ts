import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateProviderReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;
}

export class RespondToReviewDto {
  @IsString()
  @MaxLength(2000)
  response!: string;
}

export class HideReviewDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}
