import { IsEmail, IsOptional, IsString, Length, Matches, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_.]+$/, { message: "username may only contain letters, numbers, underscores, and dots" })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
