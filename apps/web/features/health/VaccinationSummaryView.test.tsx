import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { SourceType, VaccinationStatus } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthService } from "@/services/health.service";
import { VaccinationSummaryView } from "./VaccinationSummaryView";

vi.mock("@/services/health.service", () => ({
  healthService: { getVaccinationSummary: vi.fn(), updateVaccinationSummary: vi.fn() },
}));

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

describe("VaccinationSummaryView", () => {
  beforeEach(() => {
    vi.mocked(healthService.getVaccinationSummary).mockReset();
  });

  it("renders UNKNOWN as its own distinct status, never as Overdue", async () => {
    vi.mocked(healthService.getVaccinationSummary).mockResolvedValue({
      petId: "pet-1",
      status: VaccinationStatus.UNKNOWN,
      nextDueDate: null,
      lastKnownDate: null,
      notes: null,
      sourceType: SourceType.OWNER,
      sourceLabel: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    });

    renderWithIntl(<VaccinationSummaryView petId="pet-1" />);

    const select = (await screen.findByLabelText("Status")) as HTMLSelectElement;
    expect(select.value).toBe("UNKNOWN");
    expect(screen.getByRole("option", { name: "Status unknown", selected: true })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Overdue", selected: true })).toBeNull();
  });

  it("renders an unset (INCOMPLETE) summary distinctly from a declared UNKNOWN one", async () => {
    vi.mocked(healthService.getVaccinationSummary).mockResolvedValue({
      petId: "pet-1",
      status: VaccinationStatus.INCOMPLETE,
      nextDueDate: null,
      lastKnownDate: null,
      notes: null,
      sourceType: SourceType.OWNER,
      sourceLabel: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    });

    renderWithIntl(<VaccinationSummaryView petId="pet-1" />);

    const select = (await screen.findByLabelText("Status")) as HTMLSelectElement;
    expect(select.value).toBe("INCOMPLETE");
    expect(screen.getByRole("option", { name: "Not recorded yet", selected: true })).toBeTruthy();
  });
});
