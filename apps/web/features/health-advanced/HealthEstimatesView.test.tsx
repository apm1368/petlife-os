import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ClinicalEstimateStatus, type ClinicalEstimateDto } from "@petlife/types";
import { clinicalOwnerService } from "@/services/vet-panel.service";
import { HealthEstimatesView } from "./HealthEstimatesView";

vi.mock("@/services/vet-panel.service", () => ({
  clinicalOwnerService: { listEstimates: vi.fn(), approveEstimate: vi.fn(), declineEstimate: vi.fn() },
}));

function estimate(overrides: Partial<ClinicalEstimateDto> = {}): ClinicalEstimateDto {
  return {
    id: "est-1",
    petId: "pet-1",
    householdId: "hh-1",
    source: { providerOrganizationId: "org-1", providerOrganizationName: "City Vet", providerUserId: null, providerUserDisplayTitle: null, userId: null },
    clinicalVisitId: null,
    title: "Dental under GA",
    status: ClinicalEstimateStatus.PRESENTED,
    notes: null,
    lowTotalIrr: 8_500_000,
    highTotalIrr: 13_500_000,
    validUntil: null,
    presentedAt: "2026-09-12T06:00:00.000Z",
    respondedAt: null,
    declineReason: null,
    lines: [{ id: "line-1", description: "General anaesthesia", quantity: 1, unitLowIrr: 4_000_000, unitHighIrr: 6_000_000, sortOrder: 0 }],
    createdAt: "2026-09-12T06:00:00.000Z",
    updatedAt: "2026-09-12T06:00:00.000Z",
    ...overrides,
  };
}

describe("HealthEstimatesView", () => {
  beforeEach(() => {
    vi.mocked(clinicalOwnerService.listEstimates).mockReset();
    vi.mocked(clinicalOwnerService.approveEstimate).mockReset();
  });

  it("shows the quoted range rather than collapsing it to one figure, and says why it is a range", async () => {
    vi.mocked(clinicalOwnerService.listEstimates).mockResolvedValue([estimate()]);

    renderWithIntl(<HealthEstimatesView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("8,500,000 – 13,500,000 IRR")).toBeTruthy());
    // Toman is a display-only transform of the stored integer IRR.
    expect(screen.getByText("850,000 – 1,350,000 Toman")).toBeTruthy();
    expect(screen.getByText(/A range, not a fixed price/)).toBeTruthy();
  });

  it("offers approve and decline only while the clinic is waiting on a decision", async () => {
    vi.mocked(clinicalOwnerService.listEstimates).mockResolvedValue([estimate({ status: ClinicalEstimateStatus.APPROVED, respondedAt: "2026-09-12T07:00:00.000Z" })]);

    renderWithIntl(<HealthEstimatesView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Approved")).toBeTruthy());
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Decline")).toBeNull();
  });

  it("records the owner's approval", async () => {
    vi.mocked(clinicalOwnerService.listEstimates).mockResolvedValue([estimate()]);
    vi.mocked(clinicalOwnerService.approveEstimate).mockResolvedValue(estimate({ status: ClinicalEstimateStatus.APPROVED }));

    renderWithIntl(<HealthEstimatesView petId="pet-1" />);
    await waitFor(() => expect(screen.getByText("Approve")).toBeTruthy());

    fireEvent.click(screen.getByText("Approve"));

    await waitFor(() => expect(clinicalOwnerService.approveEstimate).toHaveBeenCalledWith("pet-1", "est-1"));
  });

  it("shows an explicit empty state", async () => {
    vi.mocked(clinicalOwnerService.listEstimates).mockResolvedValue([]);

    renderWithIntl(<HealthEstimatesView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No estimates.")).toBeTruthy());
  });
});
