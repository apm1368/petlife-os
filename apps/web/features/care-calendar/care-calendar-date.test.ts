import {describe,it,expect} from "vitest";
import {calendarMonth,careDayKey} from "./care-calendar-date";
describe("Jalali/Gregorian care calendar",()=>{
  it("builds Farvardin instead of relabeling a Gregorian month",()=>{
    const month=calendarMonth(new Date("2026-03-25T12:00:00Z"),true);
    expect(careDayKey(month.first)).toBe("2026-03-21");
    expect(month.dates).toHaveLength(31);
    expect(careDayKey(month.next)).toBe("2026-04-21");
    expect(month.offset).toBe(0);
  });
  it("builds Gregorian February with correct month boundary",()=>{
    const month=calendarMonth(new Date("2026-02-17T12:00:00Z"),false);
    expect(month.dates).toHaveLength(28);
    expect(careDayKey(month.first)).toBe("2026-02-01");
    expect(careDayKey(month.next)).toBe("2026-03-01");
  });
  it("maps UTC midnight boundaries to the correct Tehran date",()=>{
    expect(careDayKey("2026-09-26T20:29:59Z")).toBe("2026-09-26");
    expect(careDayKey("2026-09-26T20:30:00Z")).toBe("2026-09-27");
  });
});
