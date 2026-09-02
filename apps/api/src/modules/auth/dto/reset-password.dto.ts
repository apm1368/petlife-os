import { IsString, Length, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  @Length(1, 200)
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
