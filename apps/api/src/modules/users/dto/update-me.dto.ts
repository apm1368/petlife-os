import { Locale } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString, IsUrl, Length } from "class-validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @IsOptional()
  @IsIn(["SYSTEM", "LIGHT", "DARK"])
  themePreference?: "SYSTEM" | "LIGHT" | "DARK";

  /** Keep or clear (null) only; see UsersService.update. */
  @IsOptional()
  @IsUrl()
  avatarUrl?: string | null;
}
