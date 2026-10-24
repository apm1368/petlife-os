import { computeTransportFare, InvalidTransportFareInputError, straightLineMeters } from "./transport-fare.util";

describe("computeTransportFare", () => {
  it("adds base, the per-km part (rounded up to a rial) and the adjustment", () => {
    expect(computeTransportFare({ baseFareIrr: 500_000, perKmRateIrr: 120_000, distanceMeters: 7_250, serviceAdjustmentIrr: 50_000 })).toEqual({
      baseFareIrr: 500_000, distanceFareIrr: 870_000, serviceAdjustmentIrr: 50_000, minimumFareIrr: null, estimatedFareIrr: 1_420_000,
    });
    expect(computeTransportFare({ baseFareIrr: 0, perKmRateIrr: 1, distanceMeters: 1 }).distanceFareIrr).toBe(1); // 0.001 rial rounds up
  });
  it("applies the minimum fare and never goes below zero with a discount", () => {
    expect(computeTransportFare({ baseFareIrr: 100_000, perKmRateIrr: 10_000, distanceMeters: 500, minimumFareIrr: 400_000 }).estimatedFareIrr).toBe(400_000);
    expect(computeTransportFare({ baseFareIrr: 100_000, perKmRateIrr: 0, distanceMeters: 0, serviceAdjustmentIrr: -900_000 }).estimatedFareIrr).toBe(0);
  });
  it("is deterministic and exact on large inputs", () => {
    const a = computeTransportFare({ baseFareIrr: 1_000_000, perKmRateIrr: 3_333_333, distanceMeters: 499_999 });
    expect(a.distanceFareIrr).toBe(Number((3_333_333n * 499_999n + 999n) / 1000n));
    expect(computeTransportFare({ baseFareIrr: 1_000_000, perKmRateIrr: 3_333_333, distanceMeters: 499_999 })).toEqual(a);
  });
  it.each([
    [{ baseFareIrr: 1.5, perKmRateIrr: 1, distanceMeters: 1 }],
    [{ baseFareIrr: -1, perKmRateIrr: 1, distanceMeters: 1 }],
    [{ baseFareIrr: 1, perKmRateIrr: 1, distanceMeters: -5 }],
    [{ baseFareIrr: 1, perKmRateIrr: 1, distanceMeters: 600_000 }],
    [{ baseFareIrr: 1, perKmRateIrr: 1, distanceMeters: 1, minimumFareIrr: -1 }],
  ])("rejects invalid input %j", (input) => {
    expect(() => computeTransportFare(input)).toThrow(InvalidTransportFareInputError);
  });
});

describe("straightLineMeters", () => {
  it("measures Tajrish → Azadi Square at roughly 13 km", () => {
    const m = straightLineMeters({ lat: 35.8048, lng: 51.4344 }, { lat: 35.6997, lng: 51.338 });
    expect(m).toBeGreaterThan(13_000);
    expect(m).toBeLessThan(15_500);
  });
});
