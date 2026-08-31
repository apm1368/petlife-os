import { IsOptional, IsString, Length } from "class-validator";

export class CreateHouseholdDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  region?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;
}
