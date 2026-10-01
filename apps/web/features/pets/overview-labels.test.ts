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
