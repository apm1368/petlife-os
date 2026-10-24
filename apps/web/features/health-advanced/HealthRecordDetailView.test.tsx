import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthRecordDetailView } from "./HealthRecordDetailView";

vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { getLab: vi.fn() } }));

const lab = { id: "l1", petId: "p1", testName: "Alkaline phosphatase (ALP)", testCode: "ALP", value: "180", unit: "U/L", qualitativeResult: null, referenceRangeLow: "20", referenceRangeHigh: "150", flag: "ABNORMAL", status: "FINAL", sampleDate: "2026-09-17T08:00:00.000Z", resultDate: "2026-09-17T08:00:00.000Z", createdAt: "2026-09-17T08:00:00.000Z", sourceType: "PROVIDER", source: { providerOrganizationName: "Mehr Vet Clinic" }, clinicalVisitId: null, notes: null };

describe("HealthRecordDetailView — lab result", () => {
  it("shows the recorded value, unit and range with the source's flag, and adds no interpretation", async () => {
    vi.mocked(healthAdvancedService.getLab).mockResolvedValue(lab as never);
    renderWithIntl(<HealthRecordDetailView petId="p1" recordId="l1" kind="lab" />, "fa");
    expect(await screen.findByText("۱۸۰")).toBeTruthy(); // Persian digits; stored value untouched
    expect(screen.getByText("U/L", { exact: false })).toBeTruthy(); // unit as recorded
    expect(screen.getByText("۲۰ تا ۱۵۰")).toBeTruthy(); // low → high in natural Persian order
    expect(document.querySelector(".lab-band")?.getAttribute("data-flagged")).toBe("true");
    expect(screen.getByRole("img", { name: /۱۸۰.*۲۰.*۱۵۰/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/normal|abnormal|healthy|سالم/i);
    expect(screen.getByText("Mehr Vet Clinic")).toBeTruthy(); // provenance
  });
});
