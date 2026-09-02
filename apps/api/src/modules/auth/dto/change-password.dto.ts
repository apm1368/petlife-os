import { IsOptional, IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  /** Omitted only when the account has never had a password (OTP-only / Google-only) — see AuthPasswordService.setOrChangePassword. */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
