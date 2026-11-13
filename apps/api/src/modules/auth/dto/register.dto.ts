import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_.]+$/, { message: "username may only contain letters, numbers, underscores, and dots" })
  username!: string;

  @IsString()
  // Same ceiling as sign-in (LoginPasswordDto): bounds Argon2id work (64 MiB per hash) on oversized input.
  @Length(8, 200)
  password!: string;

  /** Optional for compatibility with existing API clients; the registration UI requires it. */
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  /** Stored unverified until a user completes the separately configured OTP flow. */
  @IsOptional()
  @IsString()
  @Matches(/^(?:\+98|0098|0)?9\d{9}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
