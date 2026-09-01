import { IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length } from "class-validator";

export class CreateAddressDto {
  @IsUUID()
  householdId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  recipient?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  phone?: string;

  @IsString()
  @Length(1, 300)
  addressLine!: string;

  @IsString()
  @Length(1, 120)
  city!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  region?: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  instructions?: string;
}
