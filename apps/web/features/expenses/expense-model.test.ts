import { describe, expect, it } from "vitest";
import type { PetExpenseEntryDto } from "@petlife/types";
import { currentYear, monthlyTotals, parseTomanToIrr, yearRange } from "./expense-model";

const entry = (spentOn: string, amountIrr: number): PetExpenseEntryDto => ({ id: spentOn + amountIrr, source: "MANUAL", category: "FOOD", amountIrr, spentOn, note: null, label: null, sourceRecordId: null });

describe("expense model", () => {
  it("spans a Jalali year from Nowruz to the last day of Esfand, leap years included", () => {
    expect(yearRange("jalali", 1405)).toEqual({ from: "2026-03-21", to: "2027-03-20" });
    expect(yearRange("jalali", 1403)).toEqual({ from: "2024-03-20", to: "2025-03-20" });
    expect(yearRange("gregorian", 2026)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("reads the current year in the locale's calendar", () => {
    expect(currentYear("jalali", "2026-03-20")).toBe(1404);
    expect(currentYear("jalali", "2026-03-21")).toBe(1405);
    expect(currentYear("gregorian", "2026-03-20")).toBe(2026);
  });

  it("buckets spending by month of the chosen calendar and ignores other years", () => {
    const entries = [entry("2026-03-21", 100), entry("2026-04-20", 50), entry("2026-04-21", 7), entry("2027-03-21", 999)];
    const jalali = monthlyTotals(entries, "jalali", 1405);
    expect(jalali[0]).toBe(150); // Farvardin: 21 Mar – 20 Apr
    expect(jalali[1]).toBe(7); // Ordibehesht starts 21 Apr
    expect(jalali.reduce((a, b) => a + b, 0)).toBe(157);
    const gregorian = monthlyTotals(entries, "gregorian", 2026);
    expect(gregorian[2]).toBe(100);
    expect(gregorian[3]).toBe(57);
  });

  it("parses Toman in Persian or Latin digits into an IRR integer, and rejects the rest", () => {
    expect(parseTomanToIrr("250,000")).toBe(2_500_000);
    expect(parseTomanToIrr("۲۵۰٬۰۰۰")).toBe(2_500_000);
    expect(parseTomanToIrr(" 1 200 ")).toBe(12_000);
    for (const bad of ["", "0", "-5", "12.5", "abc", "300000000"]) expect(parseTomanToIrr(bad)).toBeNull();
  });
});
