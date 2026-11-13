import type { AddressSnapshotDto } from "@petlife/types";
import { courierConfigUsable, haversineKm, parseCourierConfig, parsePostConfig, quoteCourier, quotePost } from "./shipping-pricing.policy";

const at = (city: string, latitude?: number, longitude?: number): AddressSnapshotDto => ({ recipient: null, phone: null, addressLine: null, city, region: null, countryCode: "IR", instructions: null, latitude, longitude });
// Tajrish → Vanak (Tehran), about 6 km in a straight line.
const tajrish = at("تهران", 35.8048, 51.4337);
const vanak = at("تهران", 35.7577, 51.4097);

describe("opetlife courier pricing", () => {
  const config = parseCourierConfig({ cities: ["تهران"], baseFareIrr: 300_000, perKmIrr: 60_000, minFareIrr: 500_000, maxKm: 25, roadFactor: 1.3, cityFlatFareIrr: { تهران: 900_000 }, pickupMinutes: 40, minutesPerKm: 4 });

  it("prices by road-adjusted distance when both sides have a map point", () => {
    const km = haversineKm({ latitude: 35.8048, longitude: 51.4337 }, { latitude: 35.7577, longitude: 51.4097 }) * 1.3;
    const quote = quoteCourier(config, tajrish, vanak);
    expect(quote).toMatchObject({ available: true, basis: "DISTANCE_ESTIMATE" });
    if (!quote.available) throw new Error("expected a quote");
    expect(quote.priceIrr).toBe(Math.ceil((300_000 + 60_000 * km) / 10_000) * 10_000);
    expect(quote.priceIrr % 10_000).toBe(0);
    expect(quote.deliveryMinutes).toBeGreaterThan(40);
  });

  it("falls back to the city fare without a map point, and refuses other cities, intercity and far trips", () => {
    expect(quoteCourier(config, at("تهران"), at("تهران"))).toMatchObject({ available: true, priceIrr: 900_000, basis: "CITY_FLAT" });
    expect(quoteCourier(config, at("تهران"), at("اصفهان"))).toMatchObject({ available: false, reason: "CITY_NOT_SERVED" });
    expect(quoteCourier(parseCourierConfig({ ...config, cities: [] }), at("تهران"), at("کرج"))).toMatchObject({ available: false, reason: "INTERCITY" });
    expect(quoteCourier(parseCourierConfig({ ...config, maxKm: 2 }), tajrish, vanak)).toMatchObject({ available: false, reason: "TOO_FAR" });
  });

  it("ignores a map point outside Iran and prices by the city fare instead", () => {
    expect(quoteCourier(config, tajrish, at("تهران", 0, 0))).toMatchObject({ available: true, priceIrr: 900_000, basis: "CITY_FLAT" });
  });

  it("never goes below the minimum fare", () => {
    const near = at("تهران", 35.8049, 51.4338);
    expect(quoteCourier(config, tajrish, near)).toMatchObject({ available: true, priceIrr: 500_000 });
  });

  it("drops malformed staff input instead of pricing with it", () => {
    const parsed = parseCourierConfig({ perKmIrr: -5, baseFareIrr: "lots", roadFactor: 9, cityFlatFareIrr: { "  شیراز ": 700_000, bad: 0 } });
    expect(parsed).toMatchObject({ perKmIrr: 0, baseFareIrr: 0, roadFactor: 1.3, cityFlatFareIrr: { شیراز: 700_000 } });
    expect(courierConfigUsable(parseCourierConfig({}))).toBe(false);
    expect(courierConfigUsable(parsed)).toBe(true);
  });
});

describe("Post Pishtaz fixed price", () => {
  it("is the staff price plus each started kilo above the included weight", () => {
    const config = parsePostConfig({ fixedPriceIrr: 750_000, includedKg: 1, perExtraKgIrr: 150_000, etaDaysMin: 2, etaDaysMax: 4 });
    expect(quotePost(config, 800)).toEqual({ priceIrr: 750_000, deliveryMinutes: 4 * 24 * 60 });
    expect(quotePost(config, 2_100)).toEqual({ priceIrr: 750_000 + 2 * 150_000, deliveryMinutes: 4 * 24 * 60 });
    expect(quotePost(config, undefined)?.priceIrr).toBe(750_000);
    expect(quotePost(parsePostConfig({}), 500)).toBeNull();
  });
});
