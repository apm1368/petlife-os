import { IsIn, IsOptional, IsString, IsUrl, Length } from "class-validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsOptional()
  @IsIn(["fa", "en"])
  locale?: "fa" | "en";

  @IsOptional()
  @IsIn(["SYSTEM", "LIGHT", "DARK"])
  themePreference?: "SYSTEM" | "LIGHT" | "DARK";

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
