import { IsString, Length, Matches } from "class-validator";

export class VerifyOtpDto {
  @IsString()
  @Length(3, 320)
  identifier!: string;

  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/, { message: "code must be numeric" })
  code!: string;
}
