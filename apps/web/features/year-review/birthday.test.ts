import { describe, expect, it } from "vitest";
import { humanYears, nextBirthday } from "./birthday";

describe("nextBirthday", () => {
  it("counts down to this year's birthday, or next year's once it has passed", () => {
    expect(nextBirthday("2021-10-20", "2026-10-12")).toEqual({ nextIso: "2026-10-20", daysUntil: 8, turning: 5 });
    expect(nextBirthday("2021-10-01", "2026-10-12")).toEqual({ nextIso: "2027-10-01", daysUntil: 354, turning: 6 });
  });

  it("is zero days on the day itself", () => {
    expect(nextBirthday("2020-10-12", "2026-10-12")).toEqual({ nextIso: "2026-10-12", daysUntil: 0, turning: 6 });
  });

  it("keeps a leap-day birthday on 1 March in common years", () => {
    expect(nextBirthday("2024-02-29", "2026-01-10")?.nextIso).toBe("2026-03-01");
    expect(nextBirthday("2024-02-29", "2027-12-31")?.nextIso).toBe("2028-02-29");
  });

  it("refuses a birth date in the future", () => {
    expect(nextBirthday("2030-01-01", "2026-10-12")).toBeNull();
  });
});

describe("humanYears", () => {
  it("uses 15 / +9 / then +5 a year for dogs and +4 for cats", () => {
    expect(humanYears("DOG", 12)).toBe(15);
    expect(humanYears("DOG", 24)).toBe(24);
    expect(humanYears("DOG", 60)).toBe(39);
    expect(humanYears("CAT", 60)).toBe(36);
    expect(humanYears("DOG", 6)).toBe(8);
  });

  it("gives no number for species without an accepted conversion or with no known age", () => {
    expect(humanYears("RABBIT", 24)).toBeNull();
    expect(humanYears("DOG", null)).toBeNull();
  });
});
