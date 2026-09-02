import { IsIn, IsNotEmpty, IsString } from "class-validator";

/** Reason is required (spec: "reason-required for sensitive actions") — a PII reveal is exactly that. */
export class RevealPiiDto {
  @IsIn(["email", "phone"])
  field!: "email" | "phone";

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
