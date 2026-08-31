import { IsString, Length } from "class-validator";

export class RequestOtpDto {
  @IsString()
  @Length(3, 320)
  identifier!: string;
}
