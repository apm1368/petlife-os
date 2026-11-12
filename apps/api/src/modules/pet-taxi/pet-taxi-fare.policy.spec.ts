import { computeFare, normalizeCity, pickRule } from "./pet-taxi-fare.policy";
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

  it("uses the pickup city's rule, else the default, ignoring inactive rules and Arabic letter forms", () => {
    const rules = [{ ...rule, active: true }, { ...rule, city: "تهران", baseFareIrr: 1, active: true }, { ...rule, city: "اصفهان", active: false }];
    expect(pickRule(rules, " تهران ")?.city).toBe("تهران");
    expect(pickRule(rules, "اصفهان")?.city).toBe("*");
    expect(pickRule(rules.slice(1, 2), "شیراز")).toBeNull();
    expect(normalizeCity("كرمان  شهر")).toBe("کرمان شهر");
  });

  it("estimates road distance and city time from the straight line", () => {
    const route = straightLineRoute({ latitude: 35.8048, longitude: 51.4344 }, { latitude: 35.6997, longitude: 51.338 });
    expect(route.source).toBe("STRAIGHT_LINE_ESTIMATE");
    expect(route.distanceMeters).toBeGreaterThan(18_000);
    expect(route.durationSeconds).toBeGreaterThan(40 * 60);
  });
});
