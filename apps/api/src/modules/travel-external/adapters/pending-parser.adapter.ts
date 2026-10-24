import { UNKNOWN_PET_POLICY } from "../scrape/pet-policy-extractor";
import { AdapterError, type DiscoveryResult, type HealthCheckResult, type NormalizedListing, type PriceObservation, type RawListing, type ScrapeContext, type TravelSourceAdapter } from "./travel-source-adapter";

/**
 * Base for a real source whose public payload has not been observed yet. Health checks run (few requests); discovery and
 * parsing refuse with PARSER_PENDING instead of guessing at field names — a speculative parser would publish garbage.
 */
export abstract class PendingParserAdapter implements TravelSourceAdapter {
  abstract readonly code: string;
  abstract readonly strategy: string;
  readonly parserReady: boolean = false;
  abstract healthCheck(ctx: ScrapeContext): Promise<HealthCheckResult>;

  protected pending(): never {
    throw new AdapterError("PARSER_PENDING", `${this.code}: field mapping is written only after the real public payload has been observed`);
  }
  discover(_ctx: ScrapeContext): Promise<DiscoveryResult> { return Promise.reject(new AdapterError("PARSER_PENDING", `${this.code}: parser pending observed payload`)); }
  fetchDetails(_ctx: ScrapeContext, _id: string): Promise<RawListing> { return Promise.reject(new AdapterError("PARSER_PENDING", `${this.code}: parser pending observed payload`)); }
  normalize(_raw: RawListing): NormalizedListing { return this.pending(); }
  extractPetPolicy(_raw: RawListing) { return UNKNOWN_PET_POLICY; }
  extractPrices(_raw: RawListing): PriceObservation[] { return []; }
  extractImages(_raw: RawListing): string[] { return []; }
}
