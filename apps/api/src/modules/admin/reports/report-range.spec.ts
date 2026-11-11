import { bucketKeys, bucketStart, defaultGranularity, delta, resolveReportRange, tehranToday } from "./report-range";

describe("report ranges (Tehran calendar)", () => {
  it("defaults to the last 30 Tehran days ending today", () => {
    // 21:00 UTC on 11 Nov is already 00:30 on 12 Nov in Tehran.
    const now = new Date("2026-11-11T21:00:00Z");
    expect(tehranToday(now)).toBe("2026-11-12");
    const r = resolveReportRange({}, now);
    expect(r.to).toBe("2026-11-12");
    expect(r.from).toBe("2026-10-14");
    expect(r.days).toBe(30);
    expect(r.granularity).toBe("day");
  });

  it("maps local midnights to UTC and builds an equal-length previous window", () => {
    const r = resolveReportRange({ from: "2026-11-01", to: "2026-11-07" });
    expect(r.startUtc.toISOString()).toBe("2026-10-31T20:30:00.000Z");
    expect(r.endUtc.toISOString()).toBe("2026-11-07T20:30:00.000Z");
    expect(r.previousFrom).toBe("2026-10-25");
    expect(r.previousTo).toBe("2026-10-31");
    expect(r.previousEndUtc.toISOString()).toBe(r.startUtc.toISOString());
  });

  it("rejects inverted, malformed and over-long ranges", () => {
    expect(() => resolveReportRange({ from: "2026-11-08", to: "2026-11-01" })).toThrow();
    expect(() => resolveReportRange({ from: "2026-02-30", to: "2026-03-01" })).toThrow();
    expect(() => resolveReportRange({ from: "2020-01-01", to: "2026-01-01" })).toThrow();
  });

  it("buckets like PostgreSQL date_trunc (Monday weeks) and keeps gaps", () => {
    expect(new Date(bucketStart(Date.UTC(2026, 10, 11), "week")).toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(bucketKeys({ from: "2026-11-01", to: "2026-11-03", granularity: "day" })).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(bucketKeys({ from: "2026-01-15", to: "2026-03-02", granularity: "month" })).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(defaultGranularity(30)).toBe("day");
    expect(defaultGranularity(90)).toBe("week");
    expect(defaultGranularity(365)).toBe("month");
  });

  it("reports change against the previous window", () => {
    expect(delta(150, 100)).toBeCloseTo(0.5);
    expect(delta(0, 0)).toBe(0);
    expect(delta(5, 0)).toBeNull();
  });
});
