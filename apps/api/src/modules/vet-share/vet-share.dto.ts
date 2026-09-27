import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsISO8601, IsUUID } from "class-validator";
export const HEALTH_SHARE_SCOPES = ["CONDITIONS", "ALLERGIES", "CURRENT_MEDICATIONS", "VACCINATION_SUMMARY", "SELECTED_DOCUMENTS", "CLINICAL_HISTORY"];
export class VetShareDto {
  @IsUUID() providerUserId!: string;
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @ArrayMaxSize(6) @IsIn(HEALTH_SHARE_SCOPES, { each: true }) scopes!: string[];
  @IsArray() @ArrayUnique() @ArrayMaxSize(50) @IsUUID(undefined, { each: true }) documentIds!: string[];
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsISO8601({ strict: true }) expiresAt!: string;
}
