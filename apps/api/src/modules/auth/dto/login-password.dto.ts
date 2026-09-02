import { IsString, Length } from "class-validator";

export class LoginPasswordDto {
  @IsString()
  @Length(1, 30)
  username!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}
