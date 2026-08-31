import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { MedicationStatus, SourceType, type MedicationDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthService } from "@/services/health.service";
import { MedicationsView } from "./MedicationsView";

vi.mock("@/services/health.service", () => ({
  healthService: { listMedications: vi.fn(), createMedication: vi.fn() },
}));

const MEDICATION: MedicationDto = {
  id: "med-1",
  petId: "pet-1",
  name: "Apoquel",
  dosage: 16,
  unit: "mg",
  frequencyText: null,
  route: null,
  status: MedicationStatus.ACTIVE,
  startDate: null,
  endDate: null,
  instructions: null,
  sourceType: SourceType.OWNER,
  sourceLabel: null,
  recordedByUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("MedicationsView RTL mixed content", () => {
  beforeEach(() => {
    vi.mocked(healthService.listMedications).mockReset();
  });

  it("renders a Latin drug name and dosage untouched, isolated with dir=auto, inside a Persian (RTL) page", async () => {
    vi.mocked(healthService.listMedications).mockResolvedValue([MEDICATION]);

    const { container } = renderWithIntl(<MedicationsView petId="pet-1" />, "fa");

    const nameLine = await waitFor(() => {
      const el = container.querySelector('p[dir="auto"]');
      if (!el) throw new Error("not rendered yet");
      return el;
    });

    expect(nameLine.textContent).toBe("Apoquel — 16 mg");
  });

  it("renders the identical mixed-content name/dosage line regardless of surrounding page direction", async () => {
    vi.mocked(healthService.listMedications).mockResolvedValue([MEDICATION]);

    const { container: enContainer, unmount } = renderWithIntl(<MedicationsView petId="pet-1" />, "en");
    const enLine = await waitFor(() => {
      const el = enContainer.querySelector('p[dir="auto"]');
      if (!el) throw new Error("not rendered yet");
      return el;
    });
    expect(enLine.textContent).toBe("Apoquel — 16 mg");
    unmount();

    const { container: faContainer } = renderWithIntl(<MedicationsView petId="pet-1" />, "fa");
    const faLine = await waitFor(() => {
      const el = faContainer.querySelector('p[dir="auto"]');
      if (!el) throw new Error("not rendered yet");
      return el;
    });
    expect(faLine.textContent).toBe("Apoquel — 16 mg");
  });
});
