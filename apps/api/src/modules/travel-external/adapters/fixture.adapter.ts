import { AdapterError, type AdapterListing, type AdapterQuote, type AdapterQuoteContext, type TravelSourceAdapter } from "./travel-source-adapter";

/**
 * Synthetic adapter for contract tests ONLY (source code "FIXTURE"; never registered outside NODE_ENV=test).
 * Its listings are labelled fixture data. Behaviour is scripted per test through `script`.
 */
export class FixtureAdapter implements TravelSourceAdapter {
  readonly code = "FIXTURE";
  script: { listings: AdapterListing[]; fail?: AdapterError; removed?: string[]; prices?: Record<string, AdapterQuote>; delayMs?: number } = { listings: [] };

  async probe() { return this.script.fail ? { ok: false, category: this.script.fail.category, detail: this.script.fail.message } : { ok: true, detail: "fixture" }; }
  async discover() { if (this.script.delayMs) await new Promise((r) => setTimeout(r, this.script.delayMs)); if (this.script.fail) throw this.script.fail; return this.script.listings; }
  async fetchListing(id: string) {
    if (this.script.fail) throw this.script.fail;
    if (this.script.removed?.includes(id)) throw new AdapterError("LISTING_REMOVED", "gone");
    const l = this.script.listings.find((x) => x.sourceListingId === id);
    if (!l) throw new AdapterError("LISTING_REMOVED", "gone");
    return l;
  }
  async quote(id: string, ctx: AdapterQuoteContext) {
    if (this.script.fail) throw this.script.fail;
    return this.script.prices?.[`${id}:${ctx.checkIn}:${ctx.checkOut}:${ctx.guests}`] ?? { priceIrr: null, priceBasis: "TOTAL_STAY" as const, availability: "UNKNOWN" as const };
  }
}
