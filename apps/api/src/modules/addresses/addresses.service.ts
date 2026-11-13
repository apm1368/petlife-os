import { Injectable } from "@nestjs/common";
import type { CustomerAddress } from "@prisma/client";
import type { CustomerAddressDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HouseholdAccessDeniedException, NotFoundApiException } from "../../common/errors/api-exception";
import { pinFromInput, type LatLng } from "../../common/geo/geo";
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
    locationConsentAt: address.locationConsentAt?.toISOString() ?? null,
    instructions: address.instructions,
    postalCode: address.postalCode,
    isDefault: address.isDefault,
    area: address.area,
  };
}

/** The stored pin columns for a create/update: a new pin carries its consent time; clearing the pin clears both. */
function pinData(dto: CreateAddressDto | UpdateAddressDto) {
  const pin = pinFromInput(dto);
  if (pin === undefined) return {};
  return pin ? { latitude: pin.latitude, longitude: pin.longitude, locationConsentAt: new Date() } : { latitude: null, longitude: null, locationConsentAt: null };
}

/** The writable address fields: the consent flag is a request-only confirmation, never a column. */
function addressFields<T extends CreateAddressDto | UpdateAddressDto>(dto: T): Omit<T, "latitude" | "longitude" | "locationConsent"> {
  const { latitude: _lat, longitude: _lng, locationConsent: _consent, ...rest } = dto;
  return rest;
}

/**
 * Household address book. Create, list, edit, choose a default and remove.
 *
 * Map pins are private: the exact point is returned only to members of the household (here, their own orders and
 * bookings) and used server-side for delivery quotes, fares and "near me" distances. Another account asking for an
 * address gets the same 404 as a missing one.
 * Removing archives: an address referenced by a Booking or Order is
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
      const existing = await tx.customerAddress.count({ where: { householdId: dto.householdId, archivedAt: null } });
      const isDefault = dto.isDefault ?? existing === 0;
      if (isDefault) await tx.customerAddress.updateMany({ where: { householdId: dto.householdId, isDefault: true }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { ...addressFields(dto), ...pinData(dto), isDefault } });
    });
    return toDto(address);
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto): Promise<CustomerAddressDto> {
    const current = await this.ownAddress(userId, addressId);
    const pin = pinData(dto);
    const address = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) await tx.customerAddress.updateMany({ where: { householdId: current.householdId, isDefault: true, id: { not: addressId } }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id: addressId }, data: { ...addressFields(dto), ...pin } });
    });
    return toDto(address);
  }

  async get(userId: string, addressId: string): Promise<CustomerAddressDto> {
    return toDto(await this.ownAddress(userId, addressId));
  }

  /**
   * The member's own "home" for near-me sorting: the pinned default address of a household they belong to (else their
   * most recently pinned address). Server-side only: callers use it to compute distances and never echo it back.
   */
  async homePoint(userId: string): Promise<LatLng | null> {
    const row = await this.prisma.customerAddress.findFirst({
      where: { archivedAt: null, latitude: { not: null }, longitude: { not: null }, household: { members: { some: { userId } } } },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      select: { latitude: true, longitude: true },
    });
    return row?.latitude != null && row.longitude != null ? { latitude: row.latitude, longitude: row.longitude } : null;
  }

  async listForHousehold(userId: string, householdId: string): Promise<CustomerAddressDto[]> {
    await this.assertMember(userId, householdId);
    const addresses = await this.prisma.customerAddress.findMany({
      where: { householdId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return addresses.map(toDto);
  }

  /** Removes an address from the book (and clears its pin). If it was the default, the most recently added remaining address takes over. */
  async archive(userId: string, addressId: string): Promise<{ archived: true; newDefaultId: string | null }> {
    const current = await this.ownAddress(userId, addressId);
    return this.prisma.$transaction(async (tx) => {
      // The archived row stays for the orders and bookings that point at it, but its exact pin (and the consent for it)
      // goes with the member's deletion. Past orders keep their own delivery snapshot.
      await tx.customerAddress.update({ where: { id: addressId }, data: { archivedAt: new Date(), isDefault: false, latitude: null, longitude: null, locationConsentAt: null } });
      if (!current.isDefault) return { archived: true as const, newDefaultId: null };
      const next = await tx.customerAddress.findFirst({ where: { householdId: current.householdId, archivedAt: null }, orderBy: { createdAt: "desc" } });
      if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      return { archived: true as const, newDefaultId: next?.id ?? null };
    });
  }

  /** An active address of a household the caller belongs to; anything else is the same 404 (no existence leak). */
  private async ownAddress(userId: string, addressId: string) {
    const current = await this.prisma.customerAddress.findFirst({ where: { id: addressId, archivedAt: null, household: { members: { some: { userId } } } } });
    if (!current) throw new NotFoundApiException("Address", { addressId });
    return current;
  }

  private async assertMember(userId: string, householdId: string): Promise<void> {
    const membership = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId } },
    });
    if (!membership) throw new HouseholdAccessDeniedException({ householdId });
  }
}
