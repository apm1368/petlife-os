import { businessHoursBetween } from "./business-hours";

/** Tehran wall-clock → UTC instant (fixed +03:30). */
const tehran = (iso: string) => new Date(new Date(`${iso}Z`).getTime() - 3.5 * 3_600_000);

describe("businessHoursBetween (Tehran working hours)", () => {
  it("counts only 09:00–17:00 on a working day", () => {
    expect(businessHoursBetween(tehran("2026-11-14T08:00:00"), tehran("2026-11-14T18:00:00"))).toBe(8); // Saturday
    expect(businessHoursBetween(tehran("2026-11-14T10:30:00"), tehran("2026-11-14T12:00:00"))).toBe(1.5);
  });
  it("gives Thursday a half day and Friday nothing", () => {
    expect(businessHoursBetween(tehran("2026-11-12T00:00:00"), tehran("2026-11-14T00:00:00"))).toBe(4); // Thu + Fri
  });
  it("spans days: Wednesday 16:00 → Saturday 10:00 is 1 + 4 + 0 + 1 hours", () => {
    expect(businessHoursBetween(tehran("2026-11-11T16:00:00"), tehran("2026-11-14T10:00:00"))).toBe(6);
  });
  it("is zero for an empty or reversed range", () => {
    const t = tehran("2026-11-14T10:00:00");
    expect(businessHoursBetween(t, t)).toBe(0);
    expect(businessHoursBetween(t, new Date(t.getTime() - 3_600_000))).toBe(0);
  });
});
