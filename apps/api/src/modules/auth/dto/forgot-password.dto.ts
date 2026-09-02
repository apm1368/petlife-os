import { IsString, Length } from "class-validator";

export class ForgotPasswordDto {
  /** A username or an email — see classifyLoginIdentifier. */
  @IsString()
  @Length(3, 320)
  identifier!: string;
}
