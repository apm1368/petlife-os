import type { HelpOffer, SupportNeedListing } from "@prisma/client";
import { AnimalSupportVerificationStatus } from "@prisma/client";
import type { HelpOfferDto, SupportNeedListingDto } from "@petlife/types";
import { resolveObjectUrls } from "../storage/object-url.util";

export type SupportNeedListingWithOrg = SupportNeedListing & {
  organization: { name: string; verificationStatus: AnimalSupportVerificationStatus; isPubliclyListed: boolean } | null;
};

/**
 * `includePublisher` is false for every public read: a listing's own
 * `creatorUserId` is the publisher's identity and the spec forbids exposing
 * personal contact by default, so anonymous browsers get `null` and only
 * the publisher's own "My listings" / admin views see it.
 */
export function toSupportNeedListingDto(row: SupportNeedListingWithOrg, includePublisher = false): SupportNeedListingDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization?.name ?? null,
    organizationVerified: row.organization
      ? row.organization.verificationStatus === AnimalSupportVerificationStatus.VERIFIED && row.organization.isPubliclyListed
      : false,
    creatorUserId: includePublisher ? row.creatorUserId : null,
    title: row.title,
    description: row.description,
    category: row.category as unknown as SupportNeedListingDto["category"],
    urgency: row.urgency as unknown as SupportNeedListingDto["urgency"],
    status: row.status as unknown as SupportNeedListingDto["status"],
    province: row.province,
    city: row.city,
    neighborhood: row.neighborhood,
    latitude: row.latitude,
    longitude: row.longitude,
    imageObjectKeys: row.imageObjectKeys,
    imageUrls: resolveObjectUrls(row.imageObjectKeys),
    neededQuantity: row.neededQuantity,
    fulfilledQuantity: row.fulfilledQuantity,
    quantityUnit: row.quantityUnit,
    campaignId: row.campaignId,
    contactMode: row.contactMode as unknown as SupportNeedListingDto["contactMode"],
    animalType: row.animalType,
    // A rejection note is moderation feedback for the publisher, never public copy.
    reviewNote: includePublisher ? row.reviewNote : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toHelpOfferDto(row: HelpOffer): HelpOfferDto {
  return {
    id: row.id,
    listingId: row.listingId,
    helperUserId: row.helperUserId,
    message: row.message,
    helpType: row.helpType as unknown as HelpOfferDto["helpType"],
    quantity: row.quantity,
    status: row.status as unknown as HelpOfferDto["status"],
    fulfilledQuantity: row.fulfilledQuantity,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
