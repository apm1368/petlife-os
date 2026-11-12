import { LostPetAreaAlertService, MAX_AREA_ALERT_RECIPIENTS, distanceKm } from "./lost-pet-area-alert.service";

describe("LostPetAreaAlertService (#290 Q53)", () => {
  it("measures distance on the earth's surface", () => {
    expect(distanceKm(35.7, 51.4, 35.7, 51.4)).toBe(0);
    expect(distanceKm(35.7, 51.4, 35.709, 51.4)).toBeCloseTo(1, 1); // 0.009° latitude ≈ 1 km
    expect(distanceKm(35.7, 51.4, 35.9, 51.4)).toBeGreaterThan(20);
  });

  it("alerts only members whose own radius covers the point, nearest first, without the household, capped", async () => {
    const rows = [
      { userId: "near", latitude: 35.709, longitude: 51.4, radiusKm: 3 },  // ~1 km, inside 3 km
      { userId: "edge", latitude: 35.745, longitude: 51.4, radiusKm: 3 },  // ~5 km, outside its own 3 km
      { userId: "wide", latitude: 35.745, longitude: 51.4, radiusKm: 10 }, // ~5 km, inside 10 km
      ...Array.from({ length: MAX_AREA_ALERT_RECIPIENTS + 5 }, (_, i) => ({ userId: `crowd-${i}`, latitude: 35.72, longitude: 51.4, radiusKm: 5 })),
    ];
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new LostPetAreaAlertService({ lostPetAreaAlert: { findMany } } as never);
    const result = await service.recipientsNear(35.7, 51.4, ["owner"]);
    expect(findMany.mock.calls[0][0].where.userId).toEqual({ notIn: ["owner"] });
    expect(findMany.mock.calls[0][0].where.user).toEqual({ accountStatus: "ACTIVE" });
    expect(result[0]).toBe("near");
    expect(result).not.toContain("edge");
    expect(result).toHaveLength(MAX_AREA_ALERT_RECIPIENTS);
  });

  it("stores the alert point to ~1 km, never the member's exact position", async () => {
    const upsert = jest.fn().mockResolvedValue({ radiusKm: 3 });
    const service = new LostPetAreaAlertService({ lostPetAreaAlert: { upsert } } as never);
    await service.set("u1", { latitude: 35.712345, longitude: 51.398765, radiusKm: 3 });
    expect(upsert.mock.calls[0][0].create).toMatchObject({ latitude: 35.71, longitude: 51.4 });
  });

  it("never returns the stored point, only on/off and the radius", async () => {
    const service = new LostPetAreaAlertService({ lostPetAreaAlert: { findUnique: jest.fn().mockResolvedValue({ radiusKm: 5 }) } } as never);
    expect(await service.get("u1")).toEqual({ active: true, radiusKm: 5 });
  });
});
