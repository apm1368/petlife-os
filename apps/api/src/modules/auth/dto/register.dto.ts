import { IsOptional, IsString, Length, Matches, MinLength } from "class-validator";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
const USERNAME_MESSAGE = "username may only contain letters, numbers, underscores, and dots";

/** Step 1 of sign-up: checks the username is free, then texts a code to the mobile. */
export class RequestRegisterOtpDto {
  @IsString()
  @Length(3, 30)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString()
  @Length(10, 20)
  phone!: string;
}

/** Step 2 of sign-up: the account is created only with the code sent to `phone`. */
export class RegisterDto {
  @IsString()
  @Length(3, 30)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsString()
  @Length(10, 20)
  phone!: string;

  @IsString()
  @Matches(/^\d{4,8}$/, { message: "code must be numeric" })
  code!: string;
}
