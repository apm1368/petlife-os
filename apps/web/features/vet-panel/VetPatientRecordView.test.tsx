import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ClinicalAlertSeverity, ClinicalAlertType, PetSpecies, type ProviderPatientRecordDto } from "@petlife/types";
import { vetPanelService } from "@/services/vet-panel.service";
import { VetPatientRecordView } from "./VetPatientRecordView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/vet-panel.service", () => ({
  vetPanelService: { getPatientRecord: vi.fn(), resolveAlert: vi.fn(), admitPatient: vi.fn(), presentEstimate: vi.fn(), cancelPrescription: vi.fn(), dispenseRefill: vi.fn() },
}));
vi.mock("@/services/provider-clinical.service", () => ({ providerClinicalService: { startVisit: vi.fn() } }));

function record(overrides: Partial<ProviderPatientRecordDto> = {}): ProviderPatientRecordDto {
  return {
    pet: {
      id: "pet-1",
      name: "Luna",
      species: PetSpecies.DOG,
      breed: "Shiba Inu",
      sex: null,
      birthDate: null,
      approximateAgeMonths: 36,
      microchipNumber: null,
      lifecycleStatus: "ACTIVE" as never,
      latestWeightValue: null,
      latestWeightUnit: null,
      photoUrl: null,
    },
    owner: { displayName: "Sarah", phone: "+989120000000" },
    careProfile: null,
    alerts: [],
    allergies: [],
    medications: [],
    conditions: [],
    problems: [],
    prescriptions: [],
    latestVitals: null,
    vitalsHistory: [],
    recentVisits: [],
    recentLabs: [],
    documents: [],
    carePlans: [],
    estimates: [],
    hospitalizations: [],
    ...overrides,
  };
}

describe("VetPatientRecordView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(vetPanelService.getPatientRecord).mockReset();
    vi.mocked(vetPanelService.resolveAlert).mockReset();
  });

  it("says nothing was recorded rather than implying a clear allergy or exam history", async () => {
    vi.mocked(vetPanelService.getPatientRecord).mockResolvedValue(record());

    renderWithIntl(<VetPatientRecordView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Luna")).toBeTruthy());
    // Two sections (allergies, active problems) both read "Nothing recorded".
    expect(screen.getAllByText("Nothing recorded").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("No exam recorded.")).toBeTruthy();
  });

  it("shows no health score anywhere", async () => {
    vi.mocked(vetPanelService.getPatientRecord).mockResolvedValue(record());

    const { container } = renderWithIntl(<VetPatientRecordView petId="pet-1" />);
    await waitFor(() => expect(screen.getByText("Luna")).toBeTruthy());

    const text = container.textContent ?? "";
    for (const word of ["Health score", "score:", "/100"]) {
      expect(text).not.toContain(word);
    }
  });

  it("renders a critical safety alert above the patient header and can resolve it", async () => {
    vi.mocked(vetPanelService.getPatientRecord).mockResolvedValue(
      record({
        alerts: [
          {
            id: "alert-1",
            petId: "pet-1",
            providerOrganizationId: "org-1",
            type: ClinicalAlertType.HANDLING,
            severity: ClinicalAlertSeverity.CRITICAL,
            message: "Muzzle required for nail trims",
            resolvedAt: null,
            createdAt: "2026-09-12T06:00:00.000Z",
          },
        ],
      }),
    );
    vi.mocked(vetPanelService.resolveAlert).mockResolvedValue({} as never);

    const { container } = renderWithIntl(<VetPatientRecordView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Muzzle required for nail trims")).toBeTruthy());
    // The alert must precede the patient name in document order.
    const text = container.textContent ?? "";
    expect(text.indexOf("Muzzle required")).toBeLessThan(text.indexOf("Luna"));

    fireEvent.click(screen.getByText("Resolve"));
    await waitFor(() => expect(vetPanelService.resolveAlert).toHaveBeenCalledWith("pet-1", "alert-1"));
  });

  it("never offers to approve an estimate on the owner's behalf", async () => {
    vi.mocked(vetPanelService.getPatientRecord).mockResolvedValue(
      record({
        estimates: [
          {
            id: "est-1",
            petId: "pet-1",
            householdId: "hh-1",
            source: { providerOrganizationId: "org-1", providerOrganizationName: "City Vet", providerUserId: null, providerUserDisplayTitle: null, userId: null },
            clinicalVisitId: null,
            title: "Dental under GA",
            status: "PRESENTED" as never,
            notes: null,
            lowTotalIrr: 1000,
            highTotalIrr: 2000,
            validUntil: null,
            presentedAt: "2026-09-12T06:00:00.000Z",
            respondedAt: null,
            declineReason: null,
            lines: [],
            createdAt: "2026-09-12T06:00:00.000Z",
            updatedAt: "2026-09-12T06:00:00.000Z",
          },
        ],
      }),
    );

    renderWithIntl(<VetPatientRecordView petId="pet-1" />);
    await waitFor(() => expect(screen.getByText("Luna")).toBeTruthy());

    fireEvent.click(screen.getByText("Estimates"));

    await waitFor(() => expect(screen.getByText("Waiting for the owner's decision.")).toBeTruthy());
    expect(screen.queryByText("Approve")).toBeNull();
  });
});
