import { PetPolicyStatus } from "@prisma/client";
import { UNKNOWN_PET_POLICY, type PetPolicyObservation } from "../scrape/pet-policy-extractor";
import { AdapterError, type DiscoveryResult, type HealthCheckResult, type NormalizedListing, type PriceObservation, type RawListing, type ScrapeContext } from "./travel-source-adapter";
import type { TravelSourceAdapter } from "./travel-source-adapter";

const ORIGIN = "https://www.jajiga.com";
const ROBOTS = `${ORIGIN}/robots.txt`;
const PET_SEARCH = `${ORIGIN}/s?rule%5B0%5D=pet`;
const MAX_PAGE_BYTES = 2_000_000;

type JsonRecord = Record<string, unknown>;
type SearchRoom = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  cityName?: unknown;
  provinceName?: unknown;
  maxGuestNumber?: unknown;
  properties?: unknown;
};

function record(v: unknown): JsonRecord | null { return v && typeof v === "object" && !Array.isArray(v) ? v as JsonRecord : null; }
function text(v: unknown, max = 200): string | undefined { return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined; }
function number(v: unknown): number | undefined { return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined; }

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

export interface JajigaSearchPage {
  roomsCount: number;
  items: SearchRoom[];
}

/** Public search page contract observed on 2026-11-08; prices are deliberately discarded without date/guest context. */
export function parseJajigaPetSearch(html: string): JajigaSearchPage {
  const initial = record(parseJajigaNextData(html).initialData)!;
  const meta = record(initial.meta);
  const rooms = record(initial.rooms);
  const rawItems = rooms?.items;
  // The live page currently returns rooms.items as an array. Accept the older
  // nested envelope too, so an upstream shape migration fails closed only when
  // neither documented representation is present.
  const itemList = Array.isArray(rawItems) ? rawItems : record(rawItems)?.items;
  const items = Array.isArray(itemList) ? itemList.map(record).filter((x): x is JsonRecord => Boolean(x)) as SearchRoom[] : [];
  const roomsCount = number(meta?.roomsCount);
  if (roomsCount === undefined || items.length === 0) throw new AdapterError("MALFORMED", "Jajiga pet search did not include its observed count and result-card fields");
  return { roomsCount, items };
}

function roomUrl(item: SearchRoom): string {
  const id = String(item.id ?? "");
  if (!/^\d{3,20}$/.test(id)) throw new AdapterError("MALFORMED", "Jajiga search result had no numeric listing id");
  const path = text(item.url, 120);
  const url = path ? new URL(path, ORIGIN) : new URL(`/room/${id}`, ORIGIN);
  if (url.origin !== ORIGIN || url.pathname !== `/room/${id}` || url.search || url.hash) throw new AdapterError("MALFORMED", "Jajiga result URL did not match the canonical room path");
  return url.toString();
}

function properties(item: SearchRoom): string[] {
  return Array.isArray(item.properties) ? item.properties.filter((x): x is string => typeof x === "string") : [];
}

function normalizeListing(raw: RawListing): NormalizedListing {
  const payload = record(raw.payload) ?? {};
  const search = record(payload.search) ?? payload;
  const detail = record(payload.detail);
  const item = (record(search.item) ?? search) as SearchRoom;
  const id = String(item.id ?? raw.externalId);
  const sourceUrl = roomUrl({ ...item, id, url: item.url ?? raw.sourceUrl });
  const title = text(detail?.title) ?? text(item.title);
  const city = text(item.cityName);
  if (!title || !city) throw new AdapterError("MALFORMED", `Jajiga listing ${id} is missing an observed title or city`);
  return {
    sourceListingId: id,
    sourceUrl,
    title,
    city,
    province: text(item.provinceName),
    capacity: number(item.maxGuestNumber),
    bedrooms: undefined,
    // Jajiga's observed page footer says all site rights belong to its operator. Until reuse terms are confirmed,
    // descriptive copy and source-hosted images are intentionally not copied or exposed in PET LIFE.
    descriptionSummary: undefined,
    amenities: [],
    // We deliberately omit source descriptions, images, amenities, exact rules and date prices
    // until source content-use terms are verified. Keep this in review even after reading the page.
    partial: true,
  };
}

export class JajigaPublicWebAdapter implements TravelSourceAdapter {
  readonly code = "JAJIGA";
  readonly strategy = "SCRAPED_PUBLIC_WEB:robots-approved-pet-search+room-page";
  readonly parserReady = true;

  async healthCheck(ctx: ScrapeContext): Promise<HealthCheckResult> {
    try {
      const robots = await ctx.http.getText(ROBOTS, { maxBytes: 200_000, accept: "text/plain" });
      const disallowAll = /^\s*Disallow:\s*\/\s*$/im.test(robots.body);
      if (disallowAll) return { ok: false, schemaOk: false, checkedUrl: ROBOTS, detail: "robots.txt disallows all paths" };
      const html = await ctx.http.getText(PET_SEARCH, { maxBytes: MAX_PAGE_BYTES, accept: "text/html" });
      const search = parseJajigaPetSearch(html.body);
      return { ok: true, schemaOk: true, checkedUrl: PET_SEARCH, detail: `Public pet-filter search observed: ${search.roomsCount} results; source descriptions/images and date-specific rates are not reused without permission/context` };
    } catch (error) {
      return { ok: false, category: error instanceof AdapterError ? error.category : "SOURCE_UNAVAILABLE", checkedUrl: PET_SEARCH, detail: error instanceof Error ? error.message : "Jajiga health check failed" };
    }
  }

  async discover(ctx: ScrapeContext): Promise<DiscoveryResult> {
    const response = await ctx.http.getText(PET_SEARCH, { maxBytes: MAX_PAGE_BYTES, accept: "text/html" });
    const page = parseJajigaPetSearch(response.body);
    const items: RawListing[] = [];
    for (const item of page.items) {
      if (items.length >= ctx.maxListings) break;
      const id = String(item.id ?? "");
      const sourceUrl = roomUrl(item);
      if (!properties(item).includes("is_pet_friendly")) continue;
      items.push({ externalId: id, sourceUrl, stage: "search", payload: { item, searchUrl: PET_SEARCH, sourceCount: page.roomsCount } });
    }
    if (!items.length) throw new AdapterError("MALFORMED", "Jajiga search page had no result carrying the observed is_pet_friendly marker");
    // The public search response only includes its first result page. Never use it to infer that omitted stays vanished.
    return { items, complete: false, strategy: this.strategy };
  }

  async fetchDetails(ctx: ScrapeContext, externalId: string, searchRaw?: RawListing): Promise<RawListing> {
    if (!/^\d{3,20}$/.test(externalId)) throw new AdapterError("MALFORMED", "Jajiga room id was not numeric");
    const sourceUrl = `${ORIGIN}/room/${externalId}`;
    const response = await ctx.http.getText(sourceUrl, { maxBytes: MAX_PAGE_BYTES, accept: "text/html" });
    const nextData = parseJajigaNextData(response.body);
    const parsed = record(nextData.initialData)!;
    const pageProps = record(nextData.pageProps)!;
    const candidate = record(searchRaw?.payload);
    const item = record(candidate?.item);
    if (String(item?.id ?? externalId) !== externalId) throw new AdapterError("MALFORMED", "Jajiga detail did not match the discovered listing id");
    const title = text(parsed.title);
    if (!title) throw new AdapterError("MALFORMED", "Jajiga detail has no observed title");
    // Do not retain descriptions, image paths, host identity, price or booking payload while source content rights are unverified.
    const detail = { title, pageTitle: text(pageProps.title) };
    return { externalId, sourceUrl, stage: "details", payload: { search: candidate ?? {}, detail } };
  }

  normalize(raw: RawListing): NormalizedListing { return normalizeListing(raw); }

  extractPetPolicy(raw: RawListing, searchRaw?: RawListing): PetPolicyObservation {
    const payload = record(searchRaw?.payload) ?? record(raw.payload);
    const item = record(payload?.item);
    if (item && properties(item as SearchRoom).includes("is_pet_friendly")) {
      return { status: PetPolicyStatus.CONFIRMED_ALLOWED, evidenceSource: "SOURCE_FILTER", evidenceText: "Returned by Jajiga's public pet-permitted search (rule[0]=pet). Species-specific limits and house rules were not exposed in this page response.", evidencePath: "initialData.rooms.items[].properties:is_pet_friendly" };
    }
    return UNKNOWN_PET_POLICY;
  }

  extractPrices(_raw: RawListing): PriceObservation[] {
    // The public pet search returned a base amount but no check-in/check-out or guest assumptions. It is not a date quote.
    return [];
  }

  extractImages(_raw: RawListing): string[] {
    // Robots allow public page retrieval but do not grant reuse rights; Jajiga's accessible footer reserves site content.
    return [];
  }
}
