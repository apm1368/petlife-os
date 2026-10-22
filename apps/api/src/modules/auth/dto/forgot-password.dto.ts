import { IsString, Length } from "class-validator";

export class ForgotPasswordDto {
  /** The username; the code goes to that account's verified mobile. */
  @IsString()
  @Length(3, 30)
  identifier!: string;
}
