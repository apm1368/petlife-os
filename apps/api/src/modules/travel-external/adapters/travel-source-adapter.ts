import type { PetEvidenceType } from "@prisma/client";

/** What an adapter hands the pipeline for one listing — normalized, source-attributed, no long-form copy. */
export interface AdapterListing {
  sourceListingId: string;
  sourceUrl: string;
  title: string;
  city: string;
  province?: string;
  area?: string;
  stayType?: string;
  latitude?: number;
  longitude?: number;
  capacity?: number;
  bedrooms?: number;
  beds?: number;
  /** Required: a listing without source pet evidence never enters the inventory. */
  petEvidence: { type: PetEvidenceType; text: string } | null;
  petPolicy?: Partial<Record<"dogs" | "cats" | "maxPets" | "sizeLimit" | "indoor" | "extraFeeIrr" | "approvalRequired", string | number | boolean>>;
  rating?: number;
  reviewCount?: number;
  instantBooking?: boolean;
  descriptionSummary?: string;
  imageUrls?: string[];
  lastSourceUpdateAt?: Date;
}

export interface AdapterQuoteContext {
  checkIn: string;
  checkOut: string;
  guests: number;
  pets?: number;
}

export interface AdapterQuote {
  priceIrr: number | null;
  oldPriceIrr?: number | null;
  discountPercent?: number | null;
  priceBasis: "TOTAL_STAY" | "PER_NIGHT";
  availability: "UNKNOWN" | "SOURCE_REPORTED_AVAILABLE" | "SOURCE_REPORTED_UNAVAILABLE";
}

export type AdapterErrorCategory = "NOT_SUPPORTED" | "BLOCKED_EXTERNAL" | "RATE_LIMITED" | "TIMEOUT" | "MALFORMED" | "SOURCE_UNAVAILABLE" | "LISTING_REMOVED";
export class AdapterError extends Error {
  constructor(public readonly category: AdapterErrorCategory, message: string) {
    super(message);
  }
}

/**
 * One implementation per source (Jabama, Alibaba, later Otaghak, Jajiga, Shab…). The pipeline (discover → fetch →
 * normalize → validate → dedupe → snapshot → publish) is shared; adapters only know how to read their source.
 */
export interface TravelSourceAdapter {
  readonly code: string;
  /** One cheap request that tells whether compliant automated access works at all. */
  probe(allowedHosts: string[], timeoutMs: number): Promise<{ ok: boolean; category?: AdapterErrorCategory; detail: string }>;
  discover(scope: { cities: string[]; limit: number }): Promise<AdapterListing[]>;
  fetchListing(sourceListingId: string): Promise<AdapterListing>;
  quote(sourceListingId: string, ctx: AdapterQuoteContext): Promise<AdapterQuote>;
}
