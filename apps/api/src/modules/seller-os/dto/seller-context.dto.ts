import { IsUUID } from "class-validator";

export class SetSellerContextDto {
  @IsUUID()
  sellerOrganizationId!: string;
}
