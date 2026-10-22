import { IsString, Length, Matches } from "class-validator";

export class LoginPasswordDto {
  @IsString()
  @Length(1, 30)
  username!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}

export class LoginChallengeDto {
  @IsString()
  @Length(16, 64)
  challengeId!: string;
}

/** For an account with no verified mobile yet: the number the sign-in code should go to. */
export class LoginPhoneDto extends LoginChallengeDto {
  @IsString()
  @Length(10, 20)
  phone!: string;
}

export class LoginVerifyDto extends LoginChallengeDto {
  @IsString()
  @Matches(/^\d{4,8}$/, { message: "code must be numeric" })
  code!: string;
}
