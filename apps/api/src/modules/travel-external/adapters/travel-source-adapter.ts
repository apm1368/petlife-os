import type { PetEvidenceType } from "@prisma/client";
import type { PetPolicyObservation } from "../scrape/pet-policy-extractor";
import type { ScrapeHttpClient } from "../scrape/scrape-http-client";

/** A normalized listing — source-attributed, short fields only (no long-form copy of the source page). */
export interface NormalizedListing {
  sourceListingId: string;
  sourceUrl: string;
  title: string;
  city: string;
  country?: string;
  province?: string;
  area?: string;
  addressText?: string;
  stayType?: string;
  /** Only when the source exposes them — never geocoded by us. */
  latitude?: number;
  longitude?: number;
  capacity?: number;
  bedrooms?: number;
  beds?: number;
  amenities?: string[];
  rating?: number;
  reviewCount?: number;
  instantBooking?: boolean;
  descriptionSummary?: string;
  lastSourceUpdateAt?: Date;
  /** Seen only in a list/search result; details not fetched yet → lifecycle DISCOVERED. */
  partial?: boolean;
}

/** Back-compat shape for staff manual records (TRAVEL-EXT-1): explicit evidence supplied by the operator. */
export interface AdapterListing extends NormalizedListing {
  petEvidence: { type: PetEvidenceType; text: string } | null;
  petPolicy?: Partial<Record<"dogs" | "cats" | "maxPets" | "sizeLimit" | "indoor" | "extraFeeIrr" | "approvalRequired", string | number | boolean>>;
  imageUrls?: string[];
}

/** One raw record as the source returned it (list item or detail payload). Raw payloads are kept only as short excerpts. */
export interface RawListing {
  externalId: string;
  sourceUrl: string;
  payload: unknown;
  /** "search" (list item) or "details". */
  stage: "search" | "details";
  /** The search window this record was observed for (prices in a search result are for these dates). */
  window?: PriceWindow;
}

export interface PriceWindow { checkIn: string; checkOut: string; guests: number }

export interface PriceObservation {
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  amount: number | null;
  oldAmount?: number | null;
  discountPercent?: number | null;
  currency: "IRR";
  priceType: "EXACT" | "FROM_PRICE" | "UNKNOWN";
  priceBasis: "TOTAL_STAY" | "PER_NIGHT";
  availability: "UNKNOWN" | "SOURCE_REPORTED_AVAILABLE" | "SOURCE_REPORTED_UNAVAILABLE";
}

export interface ScrapeContext {
  http: ScrapeHttpClient;
  cityScopes: string[];
  maxListings: number;
  /** Deterministic observation windows for this run (nearest weekend, +7, +14, +30 days). */
  windows: PriceWindow[];
  now: Date;
}

export interface DiscoveryResult {
  items: RawListing[];
  /** True only when the adapter walked its whole configured scope; partial discovery never drives removals. */
  complete: boolean;
  strategy: string;
}

export type AdapterErrorCategory = "NOT_SUPPORTED" | "PARSER_PENDING" | "BLOCKED_EXTERNAL" | "RATE_LIMITED" | "TIMEOUT" | "MALFORMED" | "PARSER_ERROR" | "SOURCE_UNAVAILABLE" | "LISTING_REMOVED" | "BUDGET_EXHAUSTED";
export class AdapterError extends Error {
  constructor(public readonly category: AdapterErrorCategory, message: string, public readonly status?: number, public readonly retryAfterMs?: number) {
    super(message);
  }
}

export interface HealthCheckResult { ok: boolean; category?: AdapterErrorCategory; detail: string; schemaOk?: boolean; checkedUrl?: string }

/**
 * One implementation per source; no source's parsing logic lives in another's adapter. The shared engine
 * (TravelExternalService.runSync) owns pacing, budgets, snapshots, diffs, lifecycle, evidence, prices, tasks.
 */
export interface TravelSourceAdapter {
  readonly code: string;
  /** Retrieval strategy label recorded on runs (e.g. UNOFFICIAL_PUBLIC_WEB_ENDPOINT:landing+search). */
  readonly strategy: string;
  /** False while the source's real payload hasn't been observed — the engine then refuses to sync (PARSER_PENDING). */
  readonly parserReady: boolean;
  /** Low-frequency, few-request check: is the public surface reachable and does it still look like we expect? */
  healthCheck(ctx: ScrapeContext): Promise<HealthCheckResult>;
  discover(ctx: ScrapeContext): Promise<DiscoveryResult>;
  fetchDetails(ctx: ScrapeContext, externalId: string): Promise<RawListing>;
  normalize(raw: RawListing): NormalizedListing;
  extractPetPolicy(raw: RawListing): PetPolicyObservation;
  extractPrices(raw: RawListing): PriceObservation[];
  extractImages(raw: RawListing): string[];
  /** Optional on-demand date quote (single request) for a member search; absent → cached observations only. */
  quote?(ctx: ScrapeContext, externalId: string, window: PriceWindow): Promise<PriceObservation>;
}
