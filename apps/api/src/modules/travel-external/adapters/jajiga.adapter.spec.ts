import { PetPolicyStatus } from "@prisma/client";
import { AdapterError } from "./travel-source-adapter";
import { JajigaPublicWebAdapter, jajigaPetSearchApiUrl, parseJajigaNextData, parseJajigaSearchApi, robotsDisallows } from "./jajiga.adapter";

const ROBOTS = { status: 200, body: "User-agent: *\nAllow: /\n", finalUrl: "https://api.jajiga.com/robots.txt", contentType: "text/plain" };

/** Shape observed from GET api.jajiga.com/api/search?rules[]=pet on 2026-11-11; values are synthetic. */
function room(id: number, extra: Record<string, unknown> = {}) {
  return {
    id, url: `/room/${id}`, short_url: "/r/x", title: `Synthetic listing ${id}`, city_name: "Lahijan", province_name: "Gilan",
    guest_number: 4, max_guest_number: 6, bedrooms: 2, floor_area: 120, rating: { total: 4.8, count: 12 },
    price: 2_500_000, price_after_discount: 2_500_000, min_price: 2_000_000, properties: ["is_pet_friendly", "is_instant"],
    host: { name: "Host name must not be stored", avatar: "https://storage.jajiga.com/avatar.jpg" },
    pictures: [{ url: "https://storage.jajiga.com/picture.jpg" }], geo: { lat: 37.2, lng: 50.0 }, invoice: { final: 2_500_000 },
    ...extra,
  };
}
function apiPage(items: unknown[], page: number, total: number, rules: string[] = ["pet"]) {
  return { meta: { rooms_count: total }, filters: { rules }, rooms: { pagination: { total, count: items.length, page, per_page: 18 }, items } };
}
function client(pages: unknown[], robots = ROBOTS, budget = 50) {
  const getJson = jest.fn(async () => { budget--; const next = pages.shift(); if (next instanceof Error) throw next; return next; });
  const getText = jest.fn(async () => { budget--; return robots; });
  const pause = jest.fn(async () => undefined);
  return { http: { getJson, getText, pause, get remaining() { return budget; } }, maxListings: 10 } as never as Parameters<JajigaPublicWebAdapter["discover"]>[0] & { http: { getJson: jest.Mock; getText: jest.Mock; pause: jest.Mock } };
}
const fullPage = (page: number, total: number) => apiPage(Array.from({ length: 18 }, (_, i) => room(3_100_000 + (page - 1) * 18 + i)), page, total);

describe("Jajiga public-web adapter", () => {
  const adapter = new JajigaPublicWebAdapter();

  it("requests the same public pet-permitted search the site calls, one page at a time", () => {
    const url = new URL(jajigaPetSearchApiUrl(3));
    expect(url.origin).toBe("https://api.jajiga.com");
    expect(url.pathname).toBe("/api/search");
    expect(url.searchParams.getAll("rules[]")).toEqual(["pet"]);
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("perPage")).toBe("18");
  });

  it("fails closed when the response does not prove the pet filter was applied", () => {
    expect(() => parseJajigaSearchApi(apiPage([room(3164640)], 1, 1, []))).toThrow(AdapterError);
    expect(() => parseJajigaSearchApi({ filters: { rules: ["pet"] }, rooms: { items: [] } })).toThrow(AdapterError);
    expect(parseJajigaSearchApi(apiPage([room(3164640)], 1, 1))).toMatchObject({ total: 1, page: 1, perPage: 18 });
  });

  it("walks every result page until the short last page and reports complete coverage", async () => {
    const ctx = client([apiPage(Array.from({ length: 18 }, (_, i) => room(3_100_000 + i)), 1, 20), apiPage([room(3_200_000), room(3_200_001)], 2, 20)]);
    const result = await adapter.discover(ctx);
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(20);
    expect(ctx.http.getJson).toHaveBeenCalledTimes(2);
    expect(result.items[19]).toMatchObject({ externalId: "3200001", sourceUrl: "https://www.jajiga.com/room/3200001", stage: "search" });
  });

  it("skips placeholder cards, repeats and unmarked results instead of failing the run", async () => {
    const ctx = client([apiPage([{}, room(3164640), room(3164640), room(3164641, { properties: [] }), { id: "promo" }], 1, 5)]);
    const result = await adapter.discover(ctx);
    expect(result.items.map((i) => i.externalId)).toEqual(["3164640"]);
  });

  it("never stores host identity, pictures or coordinates, even in the raw excerpt", async () => {
    const [raw] = (await adapter.discover(client([apiPage([room(3164640)], 1, 1)]))).items;
    const stored = JSON.stringify(raw!.payload);
    expect(stored).not.toContain("Host name");
    expect(stored).not.toContain("storage.jajiga.com");
    expect(stored).not.toContain("37.2");
  });

  it("normalizes factual card fields, pet evidence and a dated IRR from-price without a detail page", async () => {
    const [raw] = (await adapter.discover(client([apiPage([room(3164640)], 1, 1)]))).items;
    expect(adapter.fetchesDetailPages).toBe(false);
    expect(adapter.normalize(raw!)).toMatchObject({ sourceListingId: "3164640", sourceUrl: "https://www.jajiga.com/room/3164640", title: "Synthetic listing 3164640", city: "Lahijan", province: "Gilan", capacity: 6, bedrooms: 2, rating: 4.8, reviewCount: 12, instantBooking: true, partial: false });
    expect(adapter.normalize(raw!).descriptionSummary).toBeUndefined();
    expect(adapter.extractPetPolicy(raw!)).toMatchObject({ status: PetPolicyStatus.CONFIRMED_ALLOWED, evidenceSource: "SOURCE_FILTER" });
    expect(adapter.extractPrices(raw!)).toEqual([{ checkIn: null, checkOut: null, guests: 4, amount: 20_000_000, currency: "IRR", priceType: "FROM_PRICE", priceBasis: "PER_NIGHT", availability: "UNKNOWN" }]);
    expect(adapter.extractImages(raw!)).toEqual([]);
  });

  it("asks again for a page that timed out or got a 5xx, after a pause, and still finishes the walk", async () => {
    const ctx = client([fullPage(1, 40), new AdapterError("TIMEOUT", "request timed out"), new AdapterError("SOURCE_UNAVAILABLE", "HTTP 502", 502), fullPage(2, 40), apiPage([room(3_200_000)], 3, 40)]);
    const result = await adapter.discover(ctx);
    expect(result).toMatchObject({ complete: true });
    expect(result.stoppedEarly).toBeUndefined();
    expect(result.items).toHaveLength(37);
    expect(ctx.http.pause.mock.calls).toEqual([[15_000], [45_000]]);
  });

  it("keeps observed pages when a page keeps failing, and says where and why the crawl stopped", async () => {
    const timeout = () => new AdapterError("TIMEOUT", "request timed out");
    const ctx = client([fullPage(1, 40), timeout(), timeout(), timeout()]);
    const result = await adapter.discover(ctx);
    expect(result).toMatchObject({ complete: false, stoppedEarly: { category: "TIMEOUT", message: "stopped at page 2 of 3: request timed out" } });
    expect(result.items).toHaveLength(18);
    expect(ctx.http.getJson).toHaveBeenCalledTimes(4);
  });

  it("reports a crawl cut short by the request budget instead of passing it off as complete", async () => {
    const ctx = client([fullPage(1, 90), fullPage(2, 90), fullPage(3, 90)], ROBOTS, 3);
    const result = await adapter.discover(ctx);
    expect(result).toMatchObject({ complete: false, stoppedEarly: { category: "BUDGET_EXHAUSTED", message: "request budget used up before page 3 of 5" } });
    expect(result.items).toHaveLength(36);
  });

  it.each(["BLOCKED_EXTERNAL", "RATE_LIMITED"] as const)("stops the whole run on %s, with no retry", async (category) => {
    const ctx = client([apiPage(Array.from({ length: 18 }, (_, i) => room(3_100_000 + i)), 1, 40), new AdapterError(category, "denied")]);
    await expect(adapter.discover(ctx)).rejects.toMatchObject({ category });
    expect(ctx.http.getJson).toHaveBeenCalledTimes(2);
    expect(ctx.http.pause).not.toHaveBeenCalled();
  });

  it("stops paging once a single-listing refresh has seen its listing", async () => {
    const ctx = client([apiPage(Array.from({ length: 18 }, (_, i) => room(3_100_000 + i)), 1, 40), apiPage([room(3_200_000)], 2, 40)]);
    const result = await adapter.discover(ctx, { stopAtExternalId: "3100004" });
    expect(result.items.at(-1)?.externalId).toBe("3100004");
    expect(result.complete).toBe(false);
    expect(result.stoppedEarly).toBeUndefined();
    expect(ctx.http.getJson).toHaveBeenCalledTimes(1);
  });

  it("refuses to crawl when robots.txt disallows the search path", async () => {
    const ctx = client([apiPage([room(3164640)], 1, 1)], { ...ROBOTS, body: "User-agent: *\nDisallow: /api/\n" });
    await expect(adapter.discover(ctx)).rejects.toMatchObject({ category: "BLOCKED_EXTERNAL" });
    expect(ctx.http.getJson).not.toHaveBeenCalled();
  });

  it("evaluates robots rules by longest match, wildcards and our own user-agent group", () => {
    expect(robotsDisallows("User-agent: *\nAllow: /\nDisallow: /i/*\nDisallow: *utm_*\n", "/api/search")).toBe(false);
    expect(robotsDisallows("User-agent: *\nAllow: /\nDisallow: /i/*\n", "/i/room")).toBe(true);
    expect(robotsDisallows("User-agent: *\nDisallow: /api\nAllow: /api/search\n", "/api/search")).toBe(false);
    expect(robotsDisallows("User-agent: *\nAllow: /\n\nUser-agent: PetLifeDemoTravelCrawler\nDisallow: /\n", "/api/search")).toBe(true);
    expect(robotsDisallows("User-agent: Googlebot\nDisallow: /\n", "/api/search")).toBe(false);
  });

  it("reads the server-rendered page envelope without executing scripts and keeps only the title from a room page", async () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialData: { title: "Room page title", description: "Long description not copied", pictures: ["https://storage.jajiga.com/p.jpg"] } } } })}</script></html>`;
    expect(parseJajigaNextData(html)).toHaveProperty("initialData.title", "Room page title");
    const [searchRaw] = (await adapter.discover(client([apiPage([room(3164640)], 1, 1)]))).items;
    const detail = await adapter.fetchDetails({ http: { getText: jest.fn().mockResolvedValue({ status: 200, body: html }) } } as never, "3164640", searchRaw);
    expect(adapter.normalize(detail)).toMatchObject({ title: "Room page title", city: "Lahijan" });
    expect(JSON.stringify(detail.payload)).not.toContain("Long description not copied");
    expect(adapter.extractPetPolicy(detail, searchRaw).status).toBe(PetPolicyStatus.CONFIRMED_ALLOWED);
  });

  it("reports an empty or unfiltered response instead of inventing discovery", async () => {
    await expect(adapter.discover(client([apiPage([], 1, 0)]))).rejects.toMatchObject({ category: "MALFORMED" });
    await expect(adapter.discover(client([apiPage([room(3164640)], 1, 1, [])]))).rejects.toMatchObject({ category: "MALFORMED" });
  });
});
