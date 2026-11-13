import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { calendarFromIso, localizeDigits, monthName, todayIso } from "@/lib/date/jalali";
import { DateField, openingDay } from "./DateField";

describe("DateField opening month (QA M7: a past-only field opened at Dey 1278)", () => {
  it("opens at today kept inside the bounds", () => {
    expect(openingDay(undefined, "2026-11-12", "2026-11-12")).toBe("2026-11-12");
    expect(openingDay(undefined, "2020-01-01", "2026-11-12")).toBe("2020-01-01");
    expect(openingDay("2027-01-01", undefined, "2026-11-12")).toBe("2027-01-01");
    expect(openingDay(undefined, undefined, "2026-11-12")).toBe("2026-11-12");
  });

  it("an empty last-vaccination field opens at this month and a year can be picked directly", () => {
    const today = todayIso();
    const now = calendarFromIso("jalali", today);
    renderWithIntl(<DateField label="آخرین واکسن ثبت‌شده" value="" max={today} onChange={() => undefined} />, "fa");
    fireEvent.click(screen.getByRole("button", { name: /آخرین واکسن ثبت‌شده/ }));
    expect(screen.getByRole("heading", { name: `${monthName("jalali", now.month, "fa")} ${localizeDigits(now.year, "fa")}`, hidden: true })).toBeTruthy();
    const year = screen.getByRole("combobox", { name: "سال", hidden: true }) as HTMLSelectElement;
    expect(year.options[0]?.value).toBe(String(now.year));
    fireEvent.change(year, { target: { value: String(now.year - 3) } });
    expect(screen.getByRole("heading", { name: new RegExp(localizeDigits(now.year - 3, "fa")), hidden: true })).toBeTruthy();
  });

  it("in English the year list runs from this year back for a past-only field", () => {
    const today = todayIso();
    renderWithIntl(<DateField label="Last vaccine" value="" max={today} onChange={() => undefined} />, "en");
    fireEvent.click(screen.getByRole("button", { name: /Last vaccine/ }));
    const year = screen.getByRole("combobox", { name: "Year", hidden: true }) as HTMLSelectElement;
    expect(year.value).toBe(today.slice(0, 4));
    expect(Number(year.options[1]?.value)).toBe(Number(today.slice(0, 4)) - 1);
  });
});
