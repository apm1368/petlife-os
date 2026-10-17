import { Injectable } from "@nestjs/common";
import type { CustomerAddress } from "@prisma/client";
import type { CustomerAddressDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HouseholdAccessDeniedException, NotFoundApiException } from "../../common/errors/api-exception";
import type { CreateAddressDto, UpdateAddressDto } from "./dto/create-address.dto";

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
    postalCode: address.postalCode,
    isDefault: address.isDefault,
  };
}

/**
 * Household address book. Create, list, edit and choose a default (Batch 4).
 * Still no delete: an address referenced by a Booking or Order is
 * onDelete: Restrict, and orders keep their own snapshot anyway. One default
 * per household is guaranteed by a partial unique index; switching the
 * default clears the old one in the same transaction.
 */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAddressDto): Promise<CustomerAddressDto> {
    await this.assertMember(userId, dto.householdId);
    const address = await this.prisma.$transaction(async (tx) => {
      // The first address of a household becomes its default automatically.
      const existing = await tx.customerAddress.count({ where: { householdId: dto.householdId } });
      const isDefault = dto.isDefault ?? existing === 0;
      if (isDefault) await tx.customerAddress.updateMany({ where: { householdId: dto.householdId, isDefault: true }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { ...dto, isDefault } });
    });
    return toDto(address);
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto): Promise<CustomerAddressDto> {
    const current = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!current) throw new NotFoundApiException("Address", { addressId });
    await this.assertMember(userId, current.householdId);
    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) await tx.customerAddress.updateMany({ where: { householdId: current.householdId, isDefault: true, id: { not: addressId } }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id: addressId }, data: dto });
    });
    return toDto(address);
  }

  async listForHousehold(userId: string, householdId: string): Promise<CustomerAddressDto[]> {
    await this.assertMember(userId, householdId);
    const addresses = await this.prisma.customerAddress.findMany({
      where: { householdId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
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
