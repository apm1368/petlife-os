import type { AnimalSupportOrganization, DonationIntent, RescueCase, SupportCampaign, SupportCampaignUpdate } from "@prisma/client";
import type { AnimalSupportOrganizationDto, DonationFundBalanceDto, DonationHistoryItemDto, PublicDonationEntryDto, RescueCaseDto, SupportCampaignDto, SupportCampaignUpdateDto } from "@petlife/types";
import { resolveObjectUrl, resolveObjectUrls } from "../storage/object-url.util";

export function toAnimalSupportOrganizationDto(row: AnimalSupportOrganization): AnimalSupportOrganizationDto {
  return {
    id: row.id,
    type: row.type as unknown as AnimalSupportOrganizationDto["type"],
    name: row.name,
    description: row.description,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    verificationStatus: row.verificationStatus as unknown as AnimalSupportOrganizationDto["verificationStatus"],
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    logoObjectKey: row.logoObjectKey,
    logoUrl: resolveObjectUrl(row.logoObjectKey),
    imageObjectKeys: row.imageObjectKeys,
    imageUrls: resolveObjectUrls(row.imageObjectKeys),
    isPubliclyListed: row.isPubliclyListed,
    createdAt: row.createdAt.toISOString(),
  };
}

type RescueCaseWithOrg = RescueCase & { organization: { name: string } };

export function toRescueCaseDto(row: RescueCaseWithOrg): RescueCaseDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    title: row.title,
    description: row.description,
    animalType: row.animalType,
    status: row.status as unknown as RescueCaseDto["status"],
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    estimatedNeedIrr: row.estimatedNeedIrr,
    evidenceObjectKeys: row.evidenceObjectKeys,
    evidenceUrls: resolveObjectUrls(row.evidenceObjectKeys),
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

type CampaignWithOrg = SupportCampaign & { organization: { name: string } };

/** raisedAmountIrr is always the caller's own ledger-derived read (DonationLedgerService.getCampaignRaisedIrr) — never a field on the Prisma row itself (spec: "do not fake real-time raised amount from cached UI values"). */
export function toSupportCampaignDto(row: CampaignWithOrg, raisedAmountIrr: number): SupportCampaignDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    rescueCaseId: row.rescueCaseId,
    title: row.title,
    description: row.description,
    fundType: row.fundType as unknown as SupportCampaignDto["fundType"],
    targetAmountIrr: row.targetAmountIrr,
    raisedAmountIrr,
    status: row.status as unknown as SupportCampaignDto["status"],
    createdAt: row.createdAt.toISOString(),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}

export function toSupportCampaignUpdateDto(row: SupportCampaignUpdate): SupportCampaignUpdateDto {
  return {
    id: row.id,
    campaignId: row.campaignId,
    title: row.title,
    body: row.body,
    evidenceObjectKeys: row.evidenceObjectKeys,
    evidenceUrls: resolveObjectUrls(row.evidenceObjectKeys),
    createdAt: row.createdAt.toISOString(),
  };
}

type DonationIntentWithCampaign = DonationIntent & { campaign: { title: string; organization: { name: string } } };

export function toDonationHistoryItemDto(row: DonationIntentWithCampaign): DonationHistoryItemDto {
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignTitle: row.campaign.title,
    organizationName: row.campaign.organization.name,
    amountIrr: row.amountIrr,
    fundType: row.fundType as unknown as DonationHistoryItemDto["fundType"],
    status: row.status as unknown as DonationHistoryItemDto["status"],
    showDonorPublicly: row.showDonorPublicly,
    createdAt: row.createdAt.toISOString(),
    succeededAt: row.succeededAt?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
  };
}

/** spec: "Do not expose donor identities publicly unless explicit consent exists" — only ever built from a row already filtered to showDonorPublicly: true; the donor's own user id/contact never appears in this shape at all. */
export function toPublicDonationEntryDto(row: { donorDisplayName: string | null; amountIrr: number; createdAt: Date }): PublicDonationEntryDto {
  return {
    displayName: row.donorDisplayName ?? "Anonymous",
    amountIrr: row.amountIrr,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDonationFundBalanceDto(organizationId: string, generalAvailableIrr: number, restrictedAvailableIrr: number): DonationFundBalanceDto {
  return { organizationId, generalAvailableIrr, restrictedAvailableIrr };
}
