import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ClinicalAlertSeverity, ClinicalAlertType, PetSpecies, type ProviderPatientRecordDto } from "@petlife/types";
import { vetPanelService } from "@/services/vet-panel.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { usePetAccess } from "@/hooks/use-pet-access";
import { VetPatientRecordView } from "./VetPatientRecordView";

const push = vi.fn();
vi.mock("@/hooks/use-pet-access", () => ({ usePetAccess: vi.fn(() => ({ access: { canRecordClinicalData: true } })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/vet-panel.service", () => ({
  vetPanelService: { getPatientRecord: vi.fn(), resolveAlert: vi.fn(), admitPatient: vi.fn(), presentEstimate: vi.fn(), cancelPrescription: vi.fn(), dispenseRefill: vi.fn() },
}));
vi.mock("@/services/provider-clinical.service", () => ({ providerClinicalService: { startVisit: vi.fn() } }));
vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { downloadDocument: vi.fn() } }));

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
    vaccination: { status: "INCOMPLETE" as never, lastKnownDate: null, nextDueDate: null, notes: null },
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

it("keeps a read-only clinical grant free of write controls", async () => {
 vi.mocked(usePetAccess).mockReturnValue({access:{canRecordClinicalData:false}} as never);
 vi.mocked(vetPanelService.getPatientRecord).mockResolvedValue(record());
 renderWithIntl(<VetPatientRecordView petId="pet-1"/>);
 await screen.findByText("Luna");
 expect(screen.queryByRole("button",{name:/start.*visit/i})).toBeNull();
 expect(screen.queryByRole("button",{name:/admit/i})).toBeNull();
 expect(screen.queryByText("Add to clinical record")).toBeNull();
});

it("shows the owner-allowed record: medications, conditions, vaccination, labs and shared documents", async () => {
  vi.mocked(usePetAccess).mockReturnValue({ access: { canRecordClinicalData: true } } as never);
  vi.mocked(healthAdvancedService.downloadDocument).mockResolvedValue({ downloadUrl: "https://files.example/signed", expiresInSeconds: 300 });
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const source = { providerOrganizationId: "org-1", providerOrganizationName: "City Vet", providerUserId: null, providerUserDisplayTitle: null, userId: null };
  vi.mocked(vetPanelService.getPatientRecord).mockResolvedValue(
    record({
      pet: { ...record().pet, species: PetSpecies.RABBIT, sex: "FEMALE" as never, latestWeightValue: 2.4, latestWeightUnit: "KG" as never },
      medications: [{ id: "m1", name: "Meloxicam", dosage: 0.5, unit: "mg", frequencyText: "daily" }],
      conditions: [{ id: "c1", name: "Dental disease", notes: "Molar spurs" }],
      vaccination: { status: "UP_TO_DATE" as never, lastKnownDate: "2026-05-01T00:00:00.000Z", nextDueDate: "2027-05-01T00:00:00.000Z", notes: null },
      recentLabs: [{ id: "l1", petId: "pet-1", source, clinicalVisitId: null, testName: "Hematocrit", testCode: null, sampleDate: "2026-09-01T00:00:00.000Z", resultDate: null, value: "38", unit: "%", referenceRangeLow: 30, referenceRangeHigh: 50, qualitativeResult: null, status: "FINAL" as never, flag: "NORMAL" as never, sourceType: "PROVIDER" as never, notes: null, supersedesId: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }],
      documents: [{ id: "d1", petId: "pet-1", householdId: "hh-1", documentType: "LAB_REPORT" as never, title: "Last year's blood work", description: null, sourceType: "OWNER" as never, source: { ...source, providerOrganizationId: null, providerOrganizationName: null }, recordedAt: null, uploadedAt: "2026-04-02T00:00:00.000Z", mimeType: "application/pdf", fileSizeBytes: 100, visibility: "HOUSEHOLD_ONLY" as never, verificationStatus: "UNVERIFIED" as never, relatedVisitId: null, relatedLabResultId: null, relatedImagingStudyId: null, relatedReferralId: null, voidedAt: null, voidedReason: null, createdAt: "2026-04-02T00:00:00.000Z", updatedAt: "2026-04-02T00:00:00.000Z" }],
    }),
  );
  renderWithIntl(<VetPatientRecordView petId="pet-1" />);
  await screen.findByText("Luna");
  expect(screen.getByText("Rabbit · Shiba Inu · Female · Age 3y · 2.4 kg (owner-recorded)")).toBeTruthy();
  expect(screen.getByText("Meloxicam · 0.5 mg · daily")).toBeTruthy();
  expect(screen.getByText("Dental disease")).toBeTruthy();
  expect(screen.getByText("Molar spurs")).toBeTruthy();
  expect(screen.getByText("Up to date")).toBeTruthy();

  fireEvent.click(screen.getByText("Labs"));
  await screen.findByText("Hematocrit");
  expect(screen.getByText("38 %")).toBeTruthy();
  expect(screen.getByText("Within range")).toBeTruthy();
  expect(screen.getByText("Final result")).toBeTruthy();

  fireEvent.click(screen.getByText("Documents"));
  await screen.findByText("Last year's blood work");
  expect(screen.getByText(/Shared by the owner/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Secure download" }));
  await waitFor(() => expect(healthAdvancedService.downloadDocument).toHaveBeenCalledWith("pet-1", "d1"));
  await waitFor(() => expect(open).toHaveBeenCalledWith("https://files.example/signed", "_blank", "noopener,noreferrer"));
  open.mockRestore();
});

it("says plainly when no documents or labs are available", async () => {
  vi.mocked(vetPanelService.getPatientRecord).mockResolvedValue(record());
  renderWithIntl(<VetPatientRecordView petId="pet-1" />);
  await screen.findByText("Luna");
  fireEvent.click(screen.getByText("Documents"));
  expect(await screen.findByText("No documents available to you for this patient.")).toBeTruthy();
  fireEvent.click(screen.getByText("Labs"));
  expect(await screen.findByText("No lab results recorded.")).toBeTruthy();
});
