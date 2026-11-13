import { createHash } from "node:crypto";

/** The parts of a delivery address that change where a courier goes, plus when it was last edited. */
export type FingerprintAddress = {
  id: string;
  addressLine: string | null;
  city: string | null;
  area?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  updatedAt: Date | string;
};

/**
 * A shipping quote is only valid for the address it was priced for. Any change to the checkout's address (another
 * address, or an edit of the same one) changes this value, and a quote carrying a different one is stale.
 */
export function deliveryAddressFingerprint(address: FingerprintAddress | null | undefined): string {
  if (!address) return "none";
  const updatedAt = address.updatedAt instanceof Date ? address.updatedAt.toISOString() : String(address.updatedAt);
  const parts = [address.id, address.addressLine ?? "", address.city ?? "", address.area ?? "", address.postalCode ?? "", address.latitude ?? "", address.longitude ?? "", updatedAt];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}
