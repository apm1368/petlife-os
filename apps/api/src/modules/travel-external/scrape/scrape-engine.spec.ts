import { extractPetPolicyFromText } from "./pet-policy-extractor";
import { freshnessOf } from "./freshness";
import { diffFields } from "./diff";
import { compactRaw, fingerprint } from "./fingerprint";
import { ScrapeHttpClient } from "./scrape-http-client";
import { AdapterError } from "../adapters/travel-source-adapter";
import { AlibabaPublicWebAdapter } from "../adapters/alibaba.adapter";
import { observationWindows } from "../travel-external.service";
import * as safe from "../safe-fetch";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const landing = require("../adapters/__fixtures__/alibaba-landing-ramsar-villa.json");

const amenity = (text: string) => [{ text, path: "amenities[0]", kind: "AMENITY" as const }];
const rules = (text: string) => [{ text, path: "rules", kind: "RULES" as const }];

describe("pet policy extraction is deterministic and evidence-only", () => {
  it("explicit positives (amenity, policy text) → CONFIRMED_ALLOWED with excerpt, species and limits", () => {
    expect(extractPetPolicyFromText(amenity("پذیرش حیوان خانگی"))).toMatchObject({ status: "CONFIRMED_ALLOWED", evidenceSource: "SOURCE_AMENITY", evidenceText: "پذیرش حیوان خانگی" });
    expect(extractPetPolicyFromText(amenity("پت فرندلی"))).toMatchObject({ status: "CONFIRMED_ALLOWED" });
    const r = extractPetPolicyFromText(rules("ورود حیوان خانگی (سگ تا ۱۵ کیلو) مجاز است. هزینه اضافه 500000 تومان"));
    expect(r).toMatchObject({ status: "CONFIRMED_ALLOWED", dogsAllowed: true, maxWeightKg: 15, evidencePath: "rules" });
    expect(r.evidenceText!.length).toBeLessThanOrEqual(200);
  });

  it("negation in the same clause wins over the keyword", () => {
    for (const t of ["ورود حیوان خانگی ممنوع است", "پذیرش حیوان خانگی ندارد", "حیوان خانگی مجاز نیست", "ورود سگ و گربه به اقامتگاه ممنوع می‌باشد", "No pets allowed"]) {
      expect(extractPetPolicyFromText(rules(t)).status).toBe("CONFIRMED_NOT_ALLOWED");
    }
  });

  it("villa, garden, blankets or nothing → UNKNOWN (never 'not allowed'); a verdict-less pet mention in rules → AMBIGUOUS; yes+no → AMBIGUOUS", () => {
    expect(extractPetPolicyFromText(amenity("حیاط بزرگ")).status).toBe("UNKNOWN");
    expect(extractPetPolicyFromText(amenity("ویلا با باغ")).status).toBe("UNKNOWN");
    expect(extractPetPolicyFromText(amenity("پتو اضافه")).status).toBe("UNKNOWN"); // پتو ≠ پت
    expect(extractPetPolicyFromText([]).status).toBe("UNKNOWN");
    expect(extractPetPolicyFromText(rules("در مورد حیوان خانگی با میزبان هماهنگ کنید")).status).toBe("AMBIGUOUS");
    expect(extractPetPolicyFromText([...amenity("پذیرش حیوان خانگی"), ...rules("ورود حیوان خانگی ممنوع است")]).status).toBe("AMBIGUOUS");
    // A description that just mentions a dog is not evidence.
    expect(extractPetPolicyFromText([{ text: "نزدیک پارک سگ‌ها", path: "description", kind: "DESCRIPTION" }]).status).toBe("UNKNOWN");
  });
});

describe("freshness, diff, fingerprint", () => {
  const cfg = { priceFreshHours: 24, priceAgingHours: 72 };
  const ago = (h: number) => new Date(Date.now() - h * 3600e3);
  it("FRESH ≤ 24h, AGING ≤ 72h, STALE beyond, UNKNOWN never observed", () => {
    expect(freshnessOf(ago(1), cfg)).toBe("FRESH");
    expect(freshnessOf(ago(30), cfg)).toBe("AGING");
    expect(freshnessOf(ago(80), cfg)).toBe("STALE");
    expect(freshnessOf(null, cfg)).toBe("UNKNOWN");
  });
  it("diffs tracked fields with old/new values, key order independent", () => {
    expect(diffFields({ title: "a", amenities: ["x"] }, { title: "a", amenities: ["x"] })).toEqual([]);
    expect(diffFields({ title: "a", latitude: null }, { title: "b", latitude: 36.1 })).toEqual([{ field: "title", oldValue: "a", newValue: "b" }, { field: "latitude", oldValue: null, newValue: 36.1 }]);
    expect(fingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(fingerprint({ b: { d: 3, c: 2 }, a: 1 }));
  });
  it("raw excerpts are size-limited", () => {
    const big = { html: "x".repeat(20000) };
    expect(compactRaw(big)).toMatchObject({ truncated: true });
    expect(JSON.stringify(compactRaw(big)).length).toBeLessThan(4200);
    expect(compactRaw({ a: 1 })).toEqual({ a: 1 });
  });
  it("daily observation windows are deterministic: nearest weekend, +7, +14, +30 (2 nights)", () => {
    const w = observationWindows(new Date("2026-10-11T10:00:00Z")); // a Sunday
    expect(w).toEqual([{ checkIn: "2026-10-15", checkOut: "2026-10-17", guests: 2 }, { checkIn: "2026-10-18", checkOut: "2026-10-20", guests: 2 }, { checkIn: "2026-10-25", checkOut: "2026-10-27", guests: 2 }, { checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 2 }]);
  });
});

describe("ScrapeHttpClient: one at a time, polite delay, budget, stop on block", () => {
  afterEach(() => jest.restoreAllMocks());
  const cfg = { allowedHosts: ["alibaba.ir"], timeoutMs: 1000, requestDelayMinMs: 1500, requestDelayMaxMs: 3000, maxRequests: 3 };

  it("waits between requests within [min, max], never runs two at once, enforces the budget", async () => {
    let inFlight = 0, maxInFlight = 0;
    jest.spyOn(safe, "safeFetch").mockImplementation(async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return { status: 200, body: "{\"ok\":true}", finalUrl: "", contentType: "application/json" }; });
    const waits: number[] = [];
    const http = new ScrapeHttpClient(cfg, async (ms) => { waits.push(ms); });
    await Promise.all([http.getJson("https://ws.alibaba.ir/a"), http.getJson("https://ws.alibaba.ir/b"), http.postJson("https://ws.alibaba.ir/c", { x: 1 })]);
    expect(maxInFlight).toBe(1);
    expect(waits).toHaveLength(2);
    for (const w of waits) { expect(w).toBeGreaterThan(1400); expect(w).toBeLessThanOrEqual(3000); }
    await expect(http.getJson("https://ws.alibaba.ir/d")).rejects.toMatchObject({ category: "BUDGET_EXHAUSTED" });
  });

  it("maps 403/CAPTCHA → BLOCKED_EXTERNAL, 429 → RATE_LIMITED with Retry-After, 404 → LISTING_REMOVED, non-JSON → MALFORMED", async () => {
    const http = new ScrapeHttpClient({ ...cfg, maxRequests: 10 }, async () => undefined);
    const m = jest.spyOn(safe, "safeFetch");
    m.mockRejectedValueOnce(new safe.SourceFetchError("BLOCKED_BY_SOURCE", "x", 403));
    await expect(http.getText("https://www.alibaba.ir/x")).rejects.toMatchObject({ category: "BLOCKED_EXTERNAL", status: 403 });
    m.mockRejectedValueOnce(new safe.SourceFetchError("RATE_LIMITED", "x", 429, 120000));
    await expect(http.getText("https://www.alibaba.ir/x")).rejects.toMatchObject({ category: "RATE_LIMITED", retryAfterMs: 120000 });
    m.mockRejectedValueOnce(new safe.SourceFetchError("HTTP_ERROR", "x", 404));
    await expect(http.getText("https://www.alibaba.ir/x")).rejects.toMatchObject({ category: "LISTING_REMOVED" });
    m.mockResolvedValueOnce({ status: 200, body: "<html>", finalUrl: "", contentType: "text/html" });
    await expect(http.getJson("https://www.alibaba.ir/x")).rejects.toBeInstanceOf(AdapterError);
  });
});

describe("Alibaba adapter contract (sanitized observed public payload)", () => {
  it("parses the observed landing contract: destination key + FROM price only", () => {
    expect(AlibabaPublicWebAdapter.parseLanding(landing)).toEqual({ destination: "city-ramsar", minPriceIrr: 50_000_000 });
  });
  it("rejects anything that isn't the public, unauthenticated shape", () => {
    expect(() => AlibabaPublicWebAdapter.parseLanding({ ...landing, unauthorizedRequest: true })).toThrow(AdapterError);
    expect(() => AlibabaPublicWebAdapter.parseLanding({ success: false })).toThrow(AdapterError);
  });
  it("search/details parsing stays pending until their real payload is observed (no speculative parser)", async () => {
    const a = new AlibabaPublicWebAdapter();
    expect(a.parserReady).toBe(false);
    await expect(a.discover({} as never)).rejects.toMatchObject({ category: "PARSER_PENDING" });
    expect(() => a.normalize({} as never)).toThrow(AdapterError);
  });
});
