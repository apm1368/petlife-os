import { Injectable } from "@nestjs/common";
import type { CustomerAddress } from "@prisma/client";
import type { CustomerAddressDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HouseholdAccessDeniedException } from "../../common/errors/api-exception";
import type { CreateAddressDto } from "./dto/create-address.dto";

function toDto(address: CustomerAddress): CustomerAddressDto {
  return {
    id: address.id,
    householdId: address.householdId,
    label: address.label,
    recipient: address.recipient,
    phone: address.phone,
    addressLine: address.addressLine,
    city: address.city,
    region: address.region,
    countryCode: address.countryCode,
    latitude: address.latitude,
    longitude: address.longitude,
    instructions: address.instructions,
  };
}

/**
 * Deliberately minimal per spec section 18 — create + list only. No update
 * or delete endpoint this phase: an address referenced by a Booking is
 * onDelete: Restrict (see schema.prisma), so a delete endpoint would need to
 * decide what happens to booking history referencing it, which is out of
 * scope for this handoff. See README Known limitations.
 */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAddressDto): Promise<CustomerAddressDto> {
    await this.assertMember(userId, dto.householdId);
    const address = await this.prisma.customerAddress.create({ data: dto });
    return toDto(address);
  }

  async listForHousehold(userId: string, householdId: string): Promise<CustomerAddressDto[]> {
    await this.assertMember(userId, householdId);
    const addresses = await this.prisma.customerAddress.findMany({
      where: { householdId },
      orderBy: { createdAt: "desc" },
    });
    return addresses.map(toDto);
  }

  private async assertMember(userId: string, householdId: string): Promise<void> {
    const membership = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId } },
    });
    if (!membership) throw new HouseholdAccessDeniedException({ householdId });
  }
}
