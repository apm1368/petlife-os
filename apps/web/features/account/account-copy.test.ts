import { describe, expect, it } from "vitest";
import { formatAccountDate } from "./account-copy";

describe("account locale formatting", () => {
  it("uses the requested locale for Gregorian dates and preserves the Persian calendar for fa", () => {
    const date = new Date("2026-04-12T12:00:00.000Z");
    const en = formatAccountDate(date, "en");
    const de = formatAccountDate(date, "de");
    const es = formatAccountDate(date, "es");
    const fa = formatAccountDate(date, "fa");

    expect(de).not.toBe(en);
    expect(es).not.toBe(en);
    expect(fa).not.toBe(en);
    expect(de).toMatch(/12/);
    expect(es).toMatch(/12/);
  });
});
