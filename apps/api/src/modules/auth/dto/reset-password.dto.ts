import { IsString, Length, Matches, MinLength } from "class-validator";

export class ResetPasswordDto {
  /** The username the code was requested for. */
  @IsString()
  @Length(3, 30)
  identifier!: string;

  @IsString()
  @Matches(/^\d{4,8}$/, { message: "code must be numeric" })
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
