import { IsOptional, IsString, Length } from "class-validator";

export class ChangePasswordDto {
  /** Omitted only when the account has never had a password (OTP-only / Google-only) — see AuthPasswordService.setOrChangePassword. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  currentPassword?: string;

  @IsString()
  // Same ceiling as sign-in (LoginPasswordDto): bounds Argon2id work (64 MiB per hash) on oversized input.
  @Length(8, 200)
  newPassword!: string;
}
