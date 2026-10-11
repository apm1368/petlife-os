import { extractPetPolicyFromText, UNKNOWN_PET_POLICY, type PetTextCandidate } from "../scrape/pet-policy-extractor";
import { AdapterError, type DiscoveryResult, type NormalizedListing, type PriceObservation, type PriceWindow, type RawListing, type ScrapeContext, type TravelSourceAdapter } from "./travel-source-adapter";

/** SYNTHETIC test fixture payload — not real inventory, never seeded outside NODE_ENV=test. */
export interface FixturePayload {
  id: string;
  title: string;
  city: string;
  url?: string;
  province?: string;
  amenities?: string[];
  rules?: string;
  reviews?: string[];
  images?: string[];
  capacity?: number;
  lat?: number;
  lng?: number;
  /** Price per window key `${checkIn}:${checkOut}:${guests}`, or a FROM price. */
  prices?: Record<string, number | null>;
  fromPrice?: number;
  available?: boolean;
  /** Make this one record fail normalization (error isolation tests). */
  broken?: boolean;
}

/**
 * Synthetic adapter for contract tests ONLY (source code "FIXTURE"; never registered outside NODE_ENV=test).
 * `script` drives each scenario: success, unknown/confirmed pet policy, prices, removal, parser failure, 403, 429, partial.
 */
export class FixtureAdapter implements TravelSourceAdapter {
  readonly code = "FIXTURE";
  readonly strategy = "SYNTHETIC_FIXTURE";
  parserReady = true;
  script: { listings: FixturePayload[]; fail?: AdapterError; detailFail?: Record<string, AdapterError>; complete?: boolean; delayMs?: number; requestsPerListing?: number } = { listings: [] };

  async healthCheck() { return this.script.fail ? { ok: false, category: this.script.fail.category, detail: this.script.fail.message } : { ok: true, detail: "synthetic fixture", schemaOk: true }; }

  async discover(ctx: ScrapeContext): Promise<DiscoveryResult> {
    if (this.script.delayMs) await new Promise((r) => setTimeout(r, this.script.delayMs));
    if (this.script.fail) throw this.script.fail;
    const items = this.script.listings.slice(0, ctx.maxListings).map((p): RawListing => ({ externalId: p.id, sourceUrl: p.url ?? `https://fixture.example/stay/${p.id}`, payload: p, stage: "details", window: ctx.windows[0] }));
    return { items, complete: this.script.complete ?? true, strategy: this.strategy };
  }

  async fetchDetails(_ctx: ScrapeContext, id: string): Promise<RawListing> {
    const f = this.script.detailFail?.[id] ?? this.script.fail;
    if (f) throw f;
    const p = this.script.listings.find((x) => x.id === id);
    if (!p) throw new AdapterError("LISTING_REMOVED", "gone", 404);
    return { externalId: p.id, sourceUrl: p.url ?? `https://fixture.example/stay/${p.id}`, payload: p, stage: "details" };
  }

  normalize(raw: RawListing): NormalizedListing {
    const p = raw.payload as FixturePayload;
    if (p.broken) throw new AdapterError("PARSER_ERROR", "unexpected payload shape");
    return { sourceListingId: p.id, sourceUrl: raw.sourceUrl, title: p.title, city: p.city, province: p.province, amenities: p.amenities ?? [], capacity: p.capacity, latitude: p.lat, longitude: p.lng, country: "IR" };
  }

  extractPetPolicy(raw: RawListing) {
    const p = raw.payload as FixturePayload;
    // Reviews are deliberately NOT candidates: "my dog loved it" in a review is not a policy.
    const c: PetTextCandidate[] = [...(p.amenities ?? []).map((a, i) => ({ text: a, path: `amenities[${i}]`, kind: "AMENITY" as const })), ...(p.rules ? [{ text: p.rules, path: "rules", kind: "RULES" as const }] : [])];
    return c.length ? extractPetPolicyFromText(c) : UNKNOWN_PET_POLICY;
  }

  extractPrices(raw: RawListing): PriceObservation[] {
    const p = raw.payload as FixturePayload;
    const out: PriceObservation[] = [];
    const availability = p.available === undefined ? "UNKNOWN" : p.available ? "SOURCE_REPORTED_AVAILABLE" : "SOURCE_REPORTED_UNAVAILABLE";
    for (const [k, amount] of Object.entries(p.prices ?? {})) {
      const [checkIn, checkOut, guests] = k.split(":");
      out.push({ checkIn: checkIn!, checkOut: checkOut!, guests: Number(guests), amount, currency: "IRR", priceType: "EXACT", priceBasis: "TOTAL_STAY", availability });
    }
    if (p.fromPrice) out.push({ checkIn: null, checkOut: null, guests: 1, amount: p.fromPrice, currency: "IRR", priceType: "FROM_PRICE", priceBasis: "PER_NIGHT", availability: "UNKNOWN" });
    return out;
  }

  extractImages(raw: RawListing) { return (raw.payload as FixturePayload).images ?? []; }

  async quote(_ctx: ScrapeContext, id: string, w: PriceWindow): Promise<PriceObservation> {
    if (this.script.fail) throw this.script.fail;
    const p = this.script.listings.find((x) => x.id === id);
    const amount = p?.prices?.[`${w.checkIn}:${w.checkOut}:${w.guests}`] ?? null;
    return { ...w, amount, currency: "IRR", priceType: amount === null ? "UNKNOWN" : "EXACT", priceBasis: "TOTAL_STAY", availability: p?.available === undefined ? "UNKNOWN" : p.available ? "SOURCE_REPORTED_AVAILABLE" : "SOURCE_REPORTED_UNAVAILABLE" };
  }
}
