import { nextCareDate, visibleCareState } from "./care-time";
describe("Care time semantics", () => {
  const now = new Date("2026-09-26T20:30:00Z");
  it("keeps overdue care overdue without completing it", () => {
    expect(visibleCareState({ state: "UPCOMING", dueAt: new Date("2026-09-26T20:29:00Z"), snoozedUntil: null }, now)).toBe("OVERDUE");
  });
  it("snoozes the reminder without changing the original due date", () => {
    const row = { state: "UPCOMING", dueAt: new Date("2026-09-25T20:30:00Z"), snoozedUntil: new Date("2026-09-27T20:30:00Z") };
    expect(visibleCareState(row, now)).toBe("SNOOZED");
    expect(row.dueAt.toISOString()).toBe("2026-09-25T20:30:00.000Z");
    expect(visibleCareState(row, new Date("2026-09-28T00:00:00Z"))).toBe("OVERDUE");
  });
  it.each(["COMPLETED", "CANCELLED"])("preserves terminal %s history", state => {
    expect(visibleCareState({ state, dueAt: new Date(0), snoozedUntil: null }, now)).toBe(state);
  });
  it("handles due-soon and upcoming at UTC boundaries", () => {
    expect(visibleCareState({ state: "UPCOMING", dueAt: new Date("2026-09-27T00:00:00+03:30"), snoozedUntil: null }, now)).toBe("DUE");
    expect(visibleCareState({ state: "UPCOMING", dueAt: new Date("2026-09-29T00:00:00+03:30"), snoozedUntil: null }, now)).toBe("UPCOMING");
  });
  it("clamps monthly and leap-year recurrence", () => {
    expect(nextCareDate(new Date("2026-01-31T12:00:00Z"), "MONTHLY")?.toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(nextCareDate(new Date("2024-02-29T12:00:00Z"), "YEARLY")?.toISOString()).toBe("2025-02-28T12:00:00.000Z");
  });
  it("never invents a recurrence", () => {
    expect(nextCareDate(now, "ONCE")).toBeNull();
    expect(() => nextCareDate(now, "CUSTOM")).toThrow();
    expect(nextCareDate(now, "CUSTOM", 3)?.toISOString()).toBe("2026-09-29T20:30:00.000Z");
  });
});
