import { approximate, computeFare, normalizeCity, pickRuleForPoint, validCityBox } from "./pet-taxi-fare.policy";
import { straightLineRoute } from "../maps/maps.service";

const rule = { city: "*", baseFareIrr: 500_000, perKmIrr: 80_000, perMinuteIrr: 10_000, minimumFareIrr: 1_000_000, mediumSurchargePercent: 20, largeSurchargePercent: 40, extraPetIrr: 200_000 };

describe("pet taxi fare", () => {
  it("adds base, distance, time, the carrier surcharge on the trip part and extra pets, rounded up to 1,000 toman", () => {
    const { fareIrr, breakdown } = computeFare(rule, { distanceMeters: 10_000, durationSeconds: 1_800 }, "MEDIUM", 2);
    // 500k + 800k + 300k + 20% of 1.1M (220k) + 200k = 2,020,000
    expect(breakdown).toMatchObject({ baseIrr: 500_000, distanceIrr: 800_000, timeIrr: 300_000, carrierIrr: 220_000, extraPetsIrr: 200_000, minimumApplied: false, km: 10, minutes: 30 });
    expect(fareIrr).toBe(2_020_000);
    expect(computeFare(rule, { distanceMeters: 10_000, durationSeconds: 1_800 }, "LARGE", 1).fareIrr).toBe(500_000 + 1_100_000 + 440_000);
  });

  it("never charges below the minimum, and rounds odd rials up", () => {
    expect(computeFare(rule, { distanceMeters: 500, durationSeconds: 120 }, "SMALL", 1)).toMatchObject({ fareIrr: 1_000_000, breakdown: { minimumApplied: true } });
    expect(computeFare({ ...rule, minimumFareIrr: 0, baseFareIrr: 1 }, { distanceMeters: 0, durationSeconds: 0 }, "SMALL", 1).fareIrr).toBe(10_000);
  });

  it("chooses the rule from where the pickup is, never from a typed city", () => {
    const noBox = { south: null, west: null, north: null, east: null };
    const tehran = { ...rule, city: "تهران", baseFareIrr: 1, active: true, south: 35.56, west: 51.09, north: 35.84, east: 51.62 };
    const rules = [{ ...rule, active: true, ...noBox }, tehran, { ...rule, city: "اصفهان", active: false, south: 32.5, west: 51.5, north: 32.8, east: 51.8 }, { ...rule, city: "بی‌مرز", active: true, ...noBox }];
    expect(pickRuleForPoint(rules, { latitude: 35.7, longitude: 51.4 })?.city).toBe("تهران");
    // Isfahan's rule is off, and a city rule without a box never matches: both fall back to "*".
    expect(pickRuleForPoint(rules, { latitude: 32.65, longitude: 51.67 })?.city).toBe("*");
    expect(pickRuleForPoint([tehran], { latitude: 29.6, longitude: 52.5 })).toBeNull();
    // Overlapping boxes: the smaller (more specific) one wins.
    const shemiran = { ...tehran, city: "شمیران", south: 35.78, west: 51.4, north: 35.84, east: 51.5 };
    expect(pickRuleForPoint([...rules, shemiran], { latitude: 35.8, longitude: 51.43 })?.city).toBe("شمیران");
    expect(validCityBox(tehran)).toBe(true);
    expect(validCityBox({ south: 35.8, west: 51, north: 35.5, east: 51.6 })).toBe(false);
    expect(validCityBox({ south: 30, west: 50, north: 36, east: 52 })).toBe(false);
    expect(normalizeCity("كرمان  شهر")).toBe("کرمان شهر");
  });

  it("shows drivers a ~500 m grid point, not the exact place", () => {
    expect(approximate(35.80483)).toBe(35.805);
    expect(approximate(51.43441)).toBe(51.435);
    expect(Math.abs(approximate(35.7012) - 35.7012)).toBeLessThanOrEqual(0.0025);
  });

  it("estimates road distance and city time from the straight line", () => {
    const route = straightLineRoute({ latitude: 35.8048, longitude: 51.4344 }, { latitude: 35.6997, longitude: 51.338 });
    expect(route.source).toBe("STRAIGHT_LINE_ESTIMATE");
    expect(route.distanceMeters).toBeGreaterThan(18_000);
    expect(route.durationSeconds).toBeGreaterThan(40 * 60);
  });
});
