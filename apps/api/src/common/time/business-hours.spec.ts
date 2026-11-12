import { businessHoursBetween } from "./business-hours";
import { jalaliOf, persianYearRange, tehranDateKey } from "./iran-holidays";
import { IRAN_OFFICIAL_HOLIDAYS } from "./iran-holidays.data";

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
  it("skips closed days (holidays, staff closures) entirely", () => {
    // Wednesday 16:00 → Saturday 10:00 with Thursday closed: 1 (Wed) + 0 (Thu) + 0 (Fri) + 1 (Sat).
    expect(businessHoursBetween(tehran("2026-11-11T16:00:00"), tehran("2026-11-14T10:00:00"), new Set(["2026-11-12"]))).toBe(2);
    expect(businessHoursBetween(tehran("2026-11-14T08:00:00"), tehran("2026-11-14T18:00:00"), new Set(["2026-11-14"]))).toBe(0);
  });
});

describe("tehranDateKey", () => {
  it("names the Tehran calendar day, which starts at 20:30 UTC the evening before", () => {
    expect(tehranDateKey(new Date("2026-03-20T20:29:59Z"))).toBe("2026-03-20");
    expect(tehranDateKey(new Date("2026-03-20T20:30:00Z"))).toBe("2026-03-21");
  });
});

describe("Persian calendar helpers and the official list", () => {
  it("maps Persian years to Gregorian ranges", () => {
    expect(persianYearRange(1405)).toEqual({ from: "2026-03-21", to: "2027-03-20" });
    expect(jalaliOf("2026-04-02")).toEqual({ year: 1405, month: 1, day: 13 });
  });
  it("has the fixed solar holidays on their dates, consistent with the Persian date it records", () => {
    const at = (jalali: string) => IRAN_OFFICIAL_HOLIDAYS.find((h) => h.jalali === jalali);
    for (const j of ["1405-01-01", "1405-01-02", "1405-01-03", "1405-01-04", "1405-01-12", "1405-01-13", "1405-03-14", "1405-03-15", "1405-11-22", "1405-12-29"]) expect(at(j)).toBeDefined();
    expect(at("1405-01-13")?.date).toBe("2026-04-02");
    for (const h of IRAN_OFFICIAL_HOLIDAYS) {
      const j = jalaliOf(h.date);
      expect(`${j.year}-${String(j.month).padStart(2, "0")}-${String(j.day).padStart(2, "0")}`).toBe(h.jalali);
    }
  });
});

