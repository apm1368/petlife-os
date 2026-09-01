import { IsUUID } from "class-validator";

export class SetProviderContextDto {
  @IsUUID()
  providerOrganizationId!: string;
}
