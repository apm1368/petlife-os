import type { WalletOwnerDto } from "./business-wallets";

/** Sponsored listings billed per click (owner #2): where a slot shows. */
export type SponsoredPlacementValue = "SHOP" | "VETS" | "SERVICES";
export type SponsoredCampaignStatusValue = "ACTIVE" | "PAUSED" | "STOPPED";
export type SponsoredClickOutcomeValue = "BILLED" | "DUPLICATE" | "SELF" | "STAFF" | "BOT" | "INACTIVE" | "ABOVE_CEILING" | "OVER_BUDGET" | "NO_FUNDS";
/** Why a live campaign is not being shown right now. */
export type SponsoredNotServingReason = "PAUSED" | "STOPPED" | "STAFF_HOLD" | "SWITCHED_OFF" | "ABOVE_CEILING" | "BUDGET_SPENT_TODAY" | "NO_FUNDS" | "LISTING_UNAVAILABLE" | "NOT_VERIFIED";

/** At most this many sponsored items above one list (owner/QA). */
export const SPONSORED_SLOTS_PER_LIST = 2;
/** T-01: the default flat price per billable click until staff set one, integer rials (2,000 toman). */
export const SPONSORED_DEFAULT_CPC_IRR = 20_000;

/** One sponsored card. `clickPath` is the API redirect that logs the click (never link the target directly). */
export interface SponsoredSlotDto {
  campaignId: string;
  placement: SponsoredPlacementValue;
  kind: "PRODUCT" | "PROVIDER";
  title: string;
  /** Seller name (product) or city (provider). */
  subtitle: string | null;
  imageUrl: string | null;
  /** The seller's current price for a product, integer rials. */
  priceIrr: number | null;
  clickPath: string;
}

export interface SponsoredStatsDto {
  spentIrr: number;
  billedClicks: number;
  freeClicks: number;
  refundedIrr: number;
}

export interface SponsoredCampaignDto {
  id: string;
  placement: SponsoredPlacementValue;
  status: SponsoredCampaignStatusValue;
  target: { kind: "PRODUCT" | "PROVIDER"; id: string; title: string };
  dailyBudgetIrr: number;
  maxCpcIrr: number;
  staffHoldReason: string | null;
  serving: boolean;
  notServingReason: SponsoredNotServingReason | null;
  today: SponsoredStatsDto;
  total: SponsoredStatsDto;
  createdAt: string;
  stoppedAt: string | null;
  stoppedReason: string | null;
}

export interface SponsoredRateDto {
  currentIrr: number;
  next: { rateIrr: number; effectiveFrom: string } | null;
}

/** A business wallet's sponsored listings, the price per click and whether the feature is on. */
export interface SponsoredOverviewDto {
  enabled: boolean;
  verified: boolean;
  rate: SponsoredRateDto;
  campaigns: SponsoredCampaignDto[];
}

/** Something this organisation can promote. */
export interface SponsoredTargetDto {
  placement: SponsoredPlacementValue;
  kind: "PRODUCT" | "PROVIDER";
  id: string;
  title: string;
  /** Already has a live (not stopped) campaign. */
  live: boolean;
}

export interface SponsoredCampaignInput {
  placement: SponsoredPlacementValue;
  /** The product to promote (shop placement only). */
  productId?: string;
  dailyBudgetIrr: number;
  maxCpcIrr: number;
}

export interface AdminSponsoredCampaignDto extends SponsoredCampaignDto {
  owner: WalletOwnerDto;
}

export interface AdminSponsoredClickDto {
  id: string;
  clickedAt: string;
  outcome: SponsoredClickOutcomeValue;
  costIrr: number;
  rateIrr: number;
  /** Whether a signed-in account clicked; ERASED once the 90-day personal-data window has passed. */
  viewer: "SIGNED_IN" | "ANONYMOUS" | "ERASED";
  invalidatedAt: string | null;
  invalidReason: string | null;
}

export interface AdminSponsoredCampaignDetailDto {
  campaign: AdminSponsoredCampaignDto;
  clicks: AdminSponsoredClickDto[];
}

export interface AdminSponsoredRateDto extends SponsoredRateDto {
  history: { id: string; rateIrr: number; effectiveFrom: string; reason: string; setBy: string; createdAt: string }[];
}
