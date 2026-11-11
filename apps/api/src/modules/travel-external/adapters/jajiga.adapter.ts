import { PetPolicyStatus } from "@prisma/client";
import { UNKNOWN_PET_POLICY, type PetPolicyObservation } from "../scrape/pet-policy-extractor";
import { AdapterError, type DiscoveryOptions, type DiscoveryResult, type HealthCheckResult, type NormalizedListing, type PriceObservation, type RawListing, type ScrapeContext } from "./travel-source-adapter";
import type { TravelSourceAdapter } from "./travel-source-adapter";

const ORIGIN = "https://www.jajiga.com";
const API_ORIGIN = "https://api.jajiga.com";
const API_ROBOTS = `${API_ORIGIN}/robots.txt`;
const SEARCH_PATH = "/api/search";
/** The public page a person opens for the same filter; recorded as provenance only. */
export const JAJIGA_PET_SEARCH_PAGE = `${ORIGIN}/s?rule%5B0%5D=pet`;
/** Same page size the public site requests from its own search endpoint. */
const PER_PAGE = 18;
/** Hard ceiling independent of the per-run request budget (~4,500 listings). */
const MAX_PAGES = 250;
const MAX_PAGE_BYTES = 2_000_000;
const PET_MARKER = "is_pet_friendly";
/** Jajiga quotes prices in toman; PET LIFE stores IRR. */
const TOMAN_TO_IRR = 10;

type JsonRecord = Record<string, unknown>;

function record(v: unknown): JsonRecord | null { return v && typeof v === "object" && !Array.isArray(v) ? v as JsonRecord : null; }
function text(v: unknown, max = 200): string | undefined { return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined; }
function number(v: unknown): number | undefined { return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined; }
function int(v: unknown): number | undefined { const n = number(v); return n === undefined ? undefined : Math.floor(n); }
function numericId(v: unknown): string | undefined { const id = typeof v === "number" || typeof v === "string" ? String(v) : ""; return /^\d{3,20}$/.test(id) ? id : undefined; }
function properties(v: unknown): string[] { const p = record(v)?.properties; return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : []; }
/** camelCase (server-rendered page data) or snake_case (public JSON search) — the same card in two spellings. */
function field(r: JsonRecord, snake: string, camel: string): unknown { return r[snake] ?? r[camel]; }

/** URL of the public search endpoint the Jajiga site itself calls for its pet-permitted results (no login, no token). */
export function jajigaPetSearchApiUrl(page: number): string {
  const q = new URLSearchParams({ perPage: String(PER_PAGE), "rules[]": "pet", page: String(page), map_width: "1645", map_height: "800" });
  return `${API_ORIGIN}${SEARCH_PATH}?${q.toString()}`;
}

/**
 * Minimal robots.txt check for the `*` group (or a group naming our own token): true when `path` is disallowed.
 * Supports `*` and `$`; the longest matching rule wins and an Allow of equal length beats a Disallow (RFC 9309).
 */
export function robotsDisallows(robots: string, path: string, agentToken = "petlifedemotravelcrawler"): boolean {
  type Rule = { allow: boolean; pattern: string };
  type Group = { agents: string[]; rules: Rule[] };
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(rawLine.replace(/#.*$/, "").trim());
    if (!m) continue;
    const key = m[1]!.toLowerCase(), value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && (key === "allow" || key === "disallow") && value) current.rules.push({ allow: key === "allow", pattern: value });
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && agentToken.includes(a)));
  const rules = (own.length ? own : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith("$");
    const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
  };
  let best: Rule | null = null;
  for (const r of rules) {
    if (!matches(r.pattern)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return Boolean(best && !best.allow);
}

export interface JajigaSearchApiPage {
  total: number;
  page: number;
  perPage: number;
  items: JsonRecord[];
}

/**
 * Public JSON search contract observed on 2026-11-11 (`GET api.jajiga.com/api/search?rules[]=pet`). Fails closed when
 * the response does not prove the pet filter was applied, so an ignored parameter can never publish unfiltered stays.
 */
export function parseJajigaSearchApi(body: unknown): JajigaSearchApiPage {
  const root = record(body);
  const rules = record(root?.filters)?.rules;
  if (!Array.isArray(rules) || !rules.includes("pet")) throw new AdapterError("MALFORMED", "Jajiga search response did not confirm the pet-permitted filter");
  const rooms = record(root?.rooms);
  const pagination = record(rooms?.pagination);
  const items = rooms?.items;
  const total = typeof pagination?.total === "number" && pagination.total >= 0 ? Math.floor(pagination.total) : undefined;
  const page = int(pagination?.page);
  if (!Array.isArray(items) || total === undefined || page === undefined) throw new AdapterError("MALFORMED", "Jajiga search response did not include its observed pagination and result list");
  return { total, page, perPage: int(pagination?.per_page) ?? PER_PAGE, items: items.map(record).filter((x): x is JsonRecord => Boolean(x)) };
}

/** Parse Next's server-rendered data block; never evaluate the page's JavaScript. */
export function parseJajigaNextData(html: string): JsonRecord {
  if (Buffer.byteLength(html, "utf8") > MAX_PAGE_BYTES) throw new AdapterError("MALFORMED", "Jajiga HTML exceeded the public-page size limit");
  const marker = '<script id="__NEXT_DATA__" type="application/json"';
  const i = html.indexOf(marker);
  if (i < 0) throw new AdapterError("MALFORMED", "Jajiga public page did not include its observed server-rendered data block");
  const start = html.indexOf(">", i) + 1;
  const end = html.indexOf("</script>", start);
  if (start <= 0 || end < start) throw new AdapterError("MALFORMED", "Jajiga server-rendered data block was incomplete");
  try {
    const parsed = record(JSON.parse(html.slice(start, end)));
    const props = record(parsed?.props);
    const pageProps = record(props?.pageProps);
    const initialData = record(pageProps?.initialData);
    if (!initialData) throw new Error("initialData missing");
    return { pageProps: pageProps!, initialData };
  } catch {
    throw new AdapterError("MALFORMED", "Jajiga public page data did not match the observed JSON shape");
  }
}

function roomUrl(id: string, path: unknown): string {
  const p = text(path, 120);
  const url = p ? new URL(p, ORIGIN) : new URL(`/room/${id}`, ORIGIN);
  if (url.origin !== ORIGIN || url.pathname !== `/room/${id}` || url.search || url.hash) throw new AdapterError("MALFORMED", "Jajiga result URL did not match the canonical room path");
  return url.toString();
}

/**
 * Only factual card fields are kept. Host identity, pictures, coordinates and invoice detail never leave the adapter,
 * so they are not stored even in the short-lived raw excerpt.
 */
function cardFacts(room: JsonRecord, page?: number): JsonRecord {
  const rating = record(room.rating);
  return {
    id: numericId(room.id),
    url: text(room.url, 120),
    title: text(room.title),
    cityName: text(field(room, "city_name", "cityName")),
    provinceName: text(field(room, "province_name", "provinceName")),
    maxGuestNumber: int(field(room, "max_guest_number", "maxGuestNumber")),
    guestNumber: int(field(room, "guest_number", "guestNumber")),
    bedrooms: typeof room.bedrooms === "number" && room.bedrooms >= 0 ? Math.floor(room.bedrooms) : undefined,
    rating: rating ? { total: number(rating.total), count: int(rating.count) } : undefined,
    minPrice: int(field(room, "min_price", "minPrice")),
    price: int(room.price),
    priceAfterDiscount: int(field(room, "price_after_discount", "priceAfterDiscount")),
    properties: properties(room),
    ...(page ? { searchPage: page } : {}),
  };
}

/** The card is either the payload itself (search stage) or nested under `search.item` (after a detail-page read). */
function cardOf(raw: RawListing | undefined): JsonRecord | null {
  const payload = record(raw?.payload);
  if (!payload) return null;
  return record(record(payload.search)?.item) ?? payload;
}

function normalizeListing(raw: RawListing): NormalizedListing {
  const card = cardOf(raw) ?? {};
  const detail = record(record(raw.payload)?.detail);
  const id = numericId(card.id) ?? numericId(raw.externalId);
  if (!id) throw new AdapterError("MALFORMED", "Jajiga listing had no numeric id");
  const title = text(detail?.title) ?? text(card.title);
  const city = text(card.cityName);
  if (!title || !city) throw new AdapterError("MALFORMED", `Jajiga listing ${id} is missing an observed title or city`);
  const rating = record(card.rating);
  const reviewCount = int(rating?.count);
  return {
    sourceListingId: id,
    sourceUrl: roomUrl(id, card.url),
    title,
    city,
    province: text(card.provinceName),
    capacity: int(card.maxGuestNumber) ?? int(card.guestNumber),
    bedrooms: typeof card.bedrooms === "number" ? card.bedrooms : undefined,
    rating: reviewCount ? number(rating?.total) : undefined,
    reviewCount,
    instantBooking: properties(card).includes("is_instant"),
    // Long-form source copy and source-hosted images are not copied (see docs/catalog-and-accommodation-imports.md).
    descriptionSummary: undefined,
    amenities: [],
    // The public search card carries every field PET LIFE shows; no detail page is needed to publish it.
    partial: false,
  };
}

/**
 * Jajiga pet-permitted stays via the public JSON search that jajiga.com calls in an ordinary browser session (no login,
 * cookie, token or proof-of-work). One request at a time through the shared paced client; a 403/429 stops the run and
 * opens the circuit, and nothing is retried around it. Each daily run walks the result pages in order.
 */
export class JajigaPublicWebAdapter implements TravelSourceAdapter {
  readonly code = "JAJIGA";
  readonly strategy = "UNOFFICIAL_PUBLIC_WEB_ENDPOINT:api/search?rules[]=pet";
  readonly parserReady = true;
  readonly fetchesDetailPages = false;

  private async assertRobots(ctx: ScrapeContext) {
    const robots = await ctx.http.getText(API_ROBOTS, { maxBytes: 200_000, accept: "text/plain" });
    if (robotsDisallows(robots.body, SEARCH_PATH)) throw new AdapterError("BLOCKED_EXTERNAL", "api.jajiga.com robots.txt disallows the public search path");
  }

  async healthCheck(ctx: ScrapeContext): Promise<HealthCheckResult> {
    const url = jajigaPetSearchApiUrl(1);
    try {
      await this.assertRobots(ctx);
      const page = parseJajigaSearchApi(await ctx.http.getJson(url));
      const marked = page.items.filter((i) => properties(i).includes(PET_MARKER)).length;
      return { ok: true, schemaOk: true, checkedUrl: url, detail: `Public pet-permitted search reachable: ${page.total} results; ${marked}/${page.items.length} on page 1 carry the pet marker` };
    } catch (error) {
      return { ok: false, category: error instanceof AdapterError ? error.category : "SOURCE_UNAVAILABLE", checkedUrl: url, detail: error instanceof Error ? error.message : "Jajiga health check failed" };
    }
  }

  async discover(ctx: ScrapeContext, opts: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    await this.assertRobots(ctx);
    const items: RawListing[] = [];
    const seen = new Set<string>();
    let complete = false;
    for (let page = 1; page <= MAX_PAGES && ctx.http.remaining > 0; page++) {
      let result: JajigaSearchApiPage;
      try {
        result = parseJajigaSearchApi(await ctx.http.getJson(jajigaPetSearchApiUrl(page)));
      } catch (e) {
        // A block or rate limit always stops the run. Any other failure after some pages keeps what was observed,
        // reported as incomplete so no unseen stay is aged out.
        if (!items.length || (e instanceof AdapterError && (e.category === "BLOCKED_EXTERNAL" || e.category === "RATE_LIMITED"))) throw e;
        break;
      }
      for (const room of result.items) {
        const id = numericId(room.id);
        // Promotional or placeholder cards without a listing id, repeats caused by re-ordering between pages, and
        // anything lacking the explicit pet marker are skipped, never guessed.
        if (!id || seen.has(id) || !properties(room).includes(PET_MARKER)) continue;
        seen.add(id);
        items.push({ externalId: id, sourceUrl: roomUrl(id, room.url), stage: "search", payload: cardFacts(room, page) });
        if (opts.stopAtExternalId === id) return { items, complete: false, strategy: this.strategy };
      }
      if (result.items.length < result.perPage || page * result.perPage >= result.total) { complete = true; break; }
    }
    if (!items.length) throw new AdapterError("MALFORMED", "Jajiga search returned no listing carrying the is_pet_friendly marker");
    return { items, complete, strategy: this.strategy };
  }

  /** Optional single-listing read of the public room page; only its title is taken. */
  async fetchDetails(ctx: ScrapeContext, externalId: string, searchRaw?: RawListing): Promise<RawListing> {
    if (!/^\d{3,20}$/.test(externalId)) throw new AdapterError("MALFORMED", "Jajiga room id was not numeric");
    const sourceUrl = `${ORIGIN}/room/${externalId}`;
    const response = await ctx.http.getText(sourceUrl, { maxBytes: MAX_PAGE_BYTES, accept: "text/html" });
    const parsed = record(parseJajigaNextData(response.body).initialData)!;
    const card = cardOf(searchRaw);
    if (card && numericId(card.id) !== externalId) throw new AdapterError("MALFORMED", "Jajiga detail did not match the discovered listing id");
    const title = text(parsed.title);
    if (!title) throw new AdapterError("MALFORMED", "Jajiga detail has no observed title");
    // Descriptions, image paths, host identity and booking payload are not retained.
    return { externalId, sourceUrl, stage: "details", payload: { search: { item: card ?? { id: externalId } }, detail: { title } } };
  }

  normalize(raw: RawListing): NormalizedListing { return normalizeListing(raw); }

  extractPetPolicy(raw: RawListing, searchRaw?: RawListing): PetPolicyObservation {
    const card = cardOf(searchRaw) ?? cardOf(raw);
    if (card && properties(card).includes(PET_MARKER)) {
      return { status: PetPolicyStatus.CONFIRMED_ALLOWED, evidenceSource: "SOURCE_FILTER", evidenceText: "Listed in Jajiga's public pet-permitted search (rules=pet) with its is_pet_friendly marker. Species, size and house-rule limits are not published there; confirm them with the host.", evidencePath: "api/search rooms.items[].properties:is_pet_friendly" };
    }
    return UNKNOWN_PET_POLICY;
  }

  /** A date-less nightly "from" price, observed daily and shown with its observation time; never a date quote. */
  extractPrices(raw: RawListing): PriceObservation[] {
    const card = cardOf(raw);
    const toman = int(card?.minPrice) ?? int(card?.priceAfterDiscount) ?? int(card?.price);
    if (!card || !toman) return [];
    return [{ checkIn: null, checkOut: null, guests: int(card.guestNumber) ?? 2, amount: toman * TOMAN_TO_IRR, currency: "IRR", priceType: "FROM_PRICE", priceBasis: "PER_NIGHT", availability: "UNKNOWN" }];
  }

  extractImages(_raw: RawListing): string[] {
    // Source-hosted images are not referenced or copied.
    return [];
  }
}
