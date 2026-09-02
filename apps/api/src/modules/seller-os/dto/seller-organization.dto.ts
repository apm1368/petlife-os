import { IsOptional, IsString } from "class-validator";

/** Minimal Seller Settings (spec section 49) — legal/verification fields are never editable here (owned by an admin/verification workflow this project doesn't build in H09). */
export class UpdateSellerOrganizationDto {
  @IsOptional()
  @IsString()
  supportContactEmail?: string | null;

  @IsOptional()
  @IsString()
  supportContactPhone?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}
