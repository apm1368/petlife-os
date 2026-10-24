import { describe, expect, it } from "vitest";
import type { PetOverviewEventDto } from "@petlife/types";
import { collapseLabPanels } from "./overview-labels";

const lab = (id: string, day: string): PetOverviewEventDto => ({ id, type: "LAB", title: id, occurredAt: `${day}T08:00:00.000Z`, sourceType: "PROVIDER" as PetOverviewEventDto["sourceType"], providerName: null, href: `/health/advanced/labs?record=${id}`, status: "FINAL" });
const visit: PetOverviewEventDto = { id: "v1", type: "VISIT", title: "Skin follow-up", occurredAt: "2026-09-23T08:00:00.000Z", sourceType: "PROVIDER" as PetOverviewEventDto["sourceType"], providerName: "Mehr", href: "/health/advanced/visits/v1", status: "COMPLETED" };

describe("collapseLabPanels", () => {
  it("turns one day's lab panel into a single row and keeps everything else", () => {
    const rows = collapseLabPanels([visit, lab("WBC", "2026-09-17"), lab("HGB", "2026-09-17"), lab("PLT", "2026-09-17"), lab("HCT", "2026-08-01")], "en");
    expect(rows.map((r) => r.title)).toEqual(["Skin follow-up", "Lab results — 3 tests", "HCT"]);
    expect(rows[1]!.href).toBe("/health/labs");
  });
  it("counts in Persian digits on Persian pages", () => {
    const [panel] = collapseLabPanels([lab("WBC", "2026-09-17"), lab("HGB", "2026-09-17")], "fa");
    expect(panel!.title).toBe("نتایج آزمایش — ۲ مورد");
  });
});

describe("mergeCareIntoOverview", () => {
  it("puts overdue care first in attention, due care after, and upcoming care in date order — same rule on profile and dashboard", async () => {
    const { mergeCareIntoOverview } = await import("./overview-labels");
    const care = [
      { id: "a", state: "OVERDUE", dueAt: "2026-10-01T05:30:00.000Z", title: "late" },
      { id: "b", state: "DUE", dueAt: "2026-10-12T05:30:00.000Z", title: "today" },
      { id: "c", state: "UPCOMING", dueAt: "2026-10-20T05:30:00.000Z", title: "later" },
      { id: "d", state: "COMPLETED", dueAt: "2026-09-01T05:30:00.000Z", title: "done" },
    ];
    const merged = mergeCareIntoOverview({ attention: [{ id: "x", severity: "INFORMATIONAL", title: "HEALTH_PROFILE_INCOMPLETE", dueAt: null, href: "/health" }], upcoming: [{ id: "v", type: "BOOKING", title: "t", occurredAt: "2026-10-15T05:30:00.000Z", sourceType: null, providerName: null, href: "/bookings/v", status: null }] }, care, (i) => i.title);
    expect(merged.attention.map((i) => i.id)).toEqual(["care-a", "x", "care-b"]);
    expect(merged.upcoming.map((i) => i.id)).toEqual(["v", "care-c"]);
    expect(merged.upcoming[1]!.href).toBe("/care/c");
  });
});
