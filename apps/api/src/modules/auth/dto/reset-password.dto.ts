import { IsString, Length } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  @Length(1, 200)
  token!: string;

  @IsString()
  // Same ceiling as sign-in (LoginPasswordDto): bounds Argon2id work (64 MiB per hash) on oversized input.
  @Length(8, 200)
  newPassword!: string;
}
