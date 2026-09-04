import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ClinicalVisitDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerClinicalService } from "@/services/provider-clinical.service";
import { ProviderClinicalVisitView } from "./ProviderClinicalVisitView";

vi.mock("@/services/provider-clinical.service", () => ({
  providerClinicalService: { getVisit: vi.fn(), updateVisitNotes: vi.fn(), completeVisit: vi.fn(), amendVisit: vi.fn(), voidVisit: vi.fn() },
}));

function makeVisit(overrides: Partial<ClinicalVisitDetailDto> = {}): ClinicalVisitDetailDto {
  return {
    id: "visit-1",
    petId: "pet-1",
    householdId: "household-1",
    bookingId: null,
    providerOrganizationId: "org-1",
    providerOrganizationName: "Happy Paws Clinic",
    providerUserId: "pu-1",
    providerUserDisplayTitle: null,
    reasonForVisit: "Annual checkup",
    historyText: null,
    observationsText: null,
    assessmentText: null,
    planText: null,
    status: "IN_PROGRESS" as never,
    startedAt: "2026-08-01T00:00:00.000Z",
    completedAt: null,
    revisions: [],
    ...overrides,
  } as ClinicalVisitDetailDto;
}

describe("ProviderClinicalVisitView", () => {
  beforeEach(() => {
    vi.mocked(providerClinicalService.getVisit).mockReset();
    vi.mocked(providerClinicalService.completeVisit).mockReset();
    vi.mocked(providerClinicalService.amendVisit).mockReset();
  });

  it("allows editing notes and completing the visit while IN_PROGRESS", async () => {
    vi.mocked(providerClinicalService.getVisit).mockResolvedValue(makeVisit());

    renderWithIntl(<ProviderClinicalVisitView petId="pet-1" visitId="visit-1" />);

    await waitFor(() => expect(screen.getByText("In progress")).toBeTruthy());
    const reasonField = screen.getByDisplayValue("Annual checkup") as HTMLTextAreaElement;
    expect(reasonField.disabled).toBe(false);
    expect(screen.getByText("Complete visit")).toBeTruthy();
  });

  it("never allows silent editing after completion — notes become read-only and only Amend/Void remain", async () => {
    vi.mocked(providerClinicalService.getVisit).mockResolvedValue(makeVisit({ status: "COMPLETED" as never, completedAt: "2026-08-01T01:00:00.000Z" }));

    renderWithIntl(<ProviderClinicalVisitView petId="pet-1" visitId="visit-1" />);

    await waitFor(() => expect(screen.getByText("Completed")).toBeTruthy());
    const reasonField = screen.getByDisplayValue("Annual checkup") as HTMLTextAreaElement;
    expect(reasonField.disabled).toBe(true);
    expect(screen.queryByText("Complete visit")).toBeNull();
    expect(screen.queryByText("Save notes")).toBeNull();
    expect(screen.getByText("Amend visit")).toBeTruthy();
    expect(screen.getByText(/completed\. Use Amend/)).toBeTruthy();
  });

  it("amending a completed visit always requires a reason and preserves it as revision history", async () => {
    const amended = makeVisit({
      status: "AMENDED" as never,
      completedAt: "2026-08-01T01:00:00.000Z",
      revisions: [{ id: "rev-1", clinicalVisitId: "visit-1", revisionNumber: 1, reason: "Corrected history", createdAt: "2026-08-01T02:00:00.000Z" } as never],
    });
    vi.mocked(providerClinicalService.getVisit)
      .mockResolvedValueOnce(makeVisit({ status: "COMPLETED" as never, completedAt: "2026-08-01T01:00:00.000Z" }))
      .mockResolvedValue(amended);
    vi.mocked(providerClinicalService.amendVisit).mockResolvedValue(amended);

    renderWithIntl(<ProviderClinicalVisitView petId="pet-1" visitId="visit-1" />);

    await waitFor(() => expect(screen.getByText("Completed")).toBeTruthy());
    fireEvent.click(screen.getByText("Amend visit"));
    const reasonField = screen.getAllByRole("textbox").at(-1)!;
    fireEvent.change(reasonField, { target: { value: "Corrected history" } });
    fireEvent.click(screen.getAllByText("Amend visit")[1]!);

    await waitFor(() =>
      expect(providerClinicalService.amendVisit).toHaveBeenCalledWith("pet-1", "visit-1", expect.objectContaining({ reason: "Corrected history" })),
    );
    await waitFor(() => expect(screen.getByText("Corrected history")).toBeTruthy());
    expect(screen.getByText("Revision history")).toBeTruthy();
  });
});
