import { IsOptional, IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  /** Omitted only when the account has never had a password (e.g. created by code-only sign-in) — see AuthPasswordService.setOrChangePassword. */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
