import { syncDue } from "./travel-external.worker";

// The JAJIGA row's id gives a stable 9-minute jitter: parseInt("c633", 16) % 30 = 9.
const jajiga = { id: "c633a498-a923-4627-9ac0-d9c7b980f89a", syncIntervalMinutes: 1440, consecutiveFailures: 0, lastErrorCategory: null };

describe("travel sync schedule", () => {
  it("counts the daily interval from when the last run started, so a long crawl does not push every next run later", () => {
    // 2026-11-11: started 22:13:24, finished 23:30:54 (77.5 min) → next due 2026-11-12 22:13:24 + 24 h + 9 min.
    const last = { ...jajiga, lastRunAt: new Date("2026-11-11T23:30:54.658Z"), lastDurationMs: 4_650_665 };
    expect(syncDue(last, new Date("2026-11-12T22:21:00Z"))).toBe(false);
    expect(syncDue(last, new Date("2026-11-12T22:23:00Z"))).toBe(true);
  });

  it("starts a never-run source at once", () => {
    expect(syncDue({ ...jajiga, lastRunAt: null, lastDurationMs: null }, new Date())).toBe(true);
  });

  it("retries a run that failed on a timeout or 5xx an hour later, at most three times; never a block or a 429", () => {
    const failed = { ...jajiga, lastRunAt: new Date("2026-11-12T10:00:00Z"), lastDurationMs: 13_000, consecutiveFailures: 1, lastErrorCategory: "TIMEOUT" };
    expect(syncDue(failed, new Date("2026-11-12T10:30:00Z"))).toBe(false);
    expect(syncDue(failed, new Date("2026-11-12T11:01:00Z"))).toBe(true);
    expect(syncDue({ ...failed, lastErrorCategory: "SOURCE_UNAVAILABLE", consecutiveFailures: 3 }, new Date("2026-11-12T11:01:00Z"))).toBe(true);
    expect(syncDue({ ...failed, consecutiveFailures: 4 }, new Date("2026-11-12T11:01:00Z"))).toBe(false);
    for (const lastErrorCategory of ["RATE_LIMITED", "BLOCKED_EXTERNAL", "MALFORMED"]) expect(syncDue({ ...failed, lastErrorCategory }, new Date("2026-11-12T11:01:00Z"))).toBe(false);
  });
});
