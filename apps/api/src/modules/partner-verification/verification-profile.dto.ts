import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from "class-validator";
import type { PartnerVerificationProfileInput } from "@petlife/types";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
export class SaveVerificationProfileDto implements PartnerVerificationProfileInput {
  @Transform(trim) @IsString() @Length(1, 100) firstName!: string;
  @Transform(trim) @IsString() @Length(1, 100) lastName!: string;
  @Transform(trim) @IsString() @Matches(/^\+?[0-9][0-9 ()-]{6,24}$/) landline!: string;
  @IsOptional() @Transform(({ value }: { value: unknown }) => value === "" ? undefined : trim({ value }))
  @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(500) websiteUrl?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) enamadId?: string;
}
