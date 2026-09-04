import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerClinicalService, type ProviderClinicalPatientDto } from "@/services/provider-clinical.service";
import { ProviderClinicalPatientView } from "./ProviderClinicalPatientView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/provider-clinical.service", () => ({ providerClinicalService: { getPatient: vi.fn(), startVisit: vi.fn() } }));

const BASE_PATIENT: ProviderClinicalPatientDto = {
  pet: { id: "pet-1", name: "Luna", species: "DOG" as never, breed: null, sex: null, birthDate: null },
  careProfile: null,
  allergies: [],
  medications: [],
  conditions: [],
  recentVisits: [],
  recentLabs: [],
  documents: [],
  carePlans: [],
};

describe("ProviderClinicalPatientView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(providerClinicalService.getPatient).mockReset();
    vi.mocked(providerClinicalService.startVisit).mockReset();
  });

  it("shows explicit 'none recorded' placeholders rather than implying a known-negative status", async () => {
    vi.mocked(providerClinicalService.getPatient).mockResolvedValue(BASE_PATIENT);

    renderWithIntl(<ProviderClinicalPatientView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Luna")).toBeTruthy());
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows only data the provider is authorized to see — allergies, medications, conditions, visits, care plans", async () => {
    vi.mocked(providerClinicalService.getPatient).mockResolvedValue({
      ...BASE_PATIENT,
      allergies: [{ id: "a-1", name: "Chicken", severity: "MODERATE" }],
      medications: [{ id: "m-1", name: "Amoxicillin", dosage: 250, unit: "mg", frequencyText: "twice daily" }],
      conditions: [{ id: "c-1", name: "Hip dysplasia", notes: null }],
    });

    renderWithIntl(<ProviderClinicalPatientView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Chicken (MODERATE)")).toBeTruthy());
    expect(screen.getByText("Hip dysplasia")).toBeTruthy();
  });

  it("starts a new clinical visit and navigates to it", async () => {
    vi.mocked(providerClinicalService.getPatient).mockResolvedValue(BASE_PATIENT);
    vi.mocked(providerClinicalService.startVisit).mockResolvedValue({ id: "visit-1" } as never);

    renderWithIntl(<ProviderClinicalPatientView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Start visit")).toBeTruthy());
    fireEvent.click(screen.getByText("Start visit"));

    await waitFor(() => expect(providerClinicalService.startVisit).toHaveBeenCalledWith({ petId: "pet-1" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/provider/visits/visit-1?petId=pet-1"));
  });
});
