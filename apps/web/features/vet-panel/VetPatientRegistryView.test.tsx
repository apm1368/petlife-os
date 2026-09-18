import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { PatientAccessState, PetSpecies, type PaginatedDto, type ProviderPatientSummaryDto } from "@petlife/types";
import { vetPanelService } from "@/services/vet-panel.service";
import { VetPatientRegistryView } from "./VetPatientRegistryView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/vet-panel.service", () => ({ vetPanelService: { listPatients: vi.fn() } }));

function patient(overrides: Partial<ProviderPatientSummaryDto> = {}): ProviderPatientSummaryDto {
  return {
    petId: "pet-1",
    name: "Luna",
    species: PetSpecies.DOG,
    breed: "Shiba Inu",
    sex: null,
    birthDate: null,
    approximateAgeMonths: 36,
    photoUrl: null,
    microchipNumber: null,
    lifecycleStatus: "ACTIVE" as never,
    latestWeightValue: null,
    latestWeightUnit: null,
    ownerDisplayName: "Sarah",
    accessState: PatientAccessState.ACTIVE,
    accessExpiresAt: null,
    lastVisitAt: null,
    visitCount: 0,
    openVisitId: null,
    activeHospitalizationId: null,
    activeAlertCount: 0,
    highestActiveAlertSeverity: null,
    ...overrides,
  };
}

function page(items: ProviderPatientSummaryDto[], total = items.length): PaginatedDto<ProviderPatientSummaryDto> {
  return { items, total, page: 1, pageSize: 20 };
}

describe("VetPatientRegistryView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(vetPanelService.listPatients).mockReset();
  });

  it("states 'no visits recorded' rather than leaving a blank date that could read as nothing being needed", async () => {
    vi.mocked(vetPanelService.listPatients).mockResolvedValue(page([patient()]));

    renderWithIntl(<VetPatientRegistryView />);

    await waitFor(() => expect(screen.getByText("Luna")).toBeTruthy());
    expect(screen.getByText("No visits recorded")).toBeTruthy();
    expect(screen.getByText("Record open")).toBeTruthy();
  });

  it("labels a lapsed grant as expired access rather than hiding the patient", async () => {
    vi.mocked(vetPanelService.listPatients).mockResolvedValue(page([patient({ accessState: PatientAccessState.EXPIRED })]));

    renderWithIntl(<VetPatientRegistryView />);

    await waitFor(() => expect(screen.getByText("Access expired")).toBeTruthy());
    // Still listed and still navigable — the server, not the UI, refuses the record.
    expect(screen.getByText("Luna")).toBeTruthy();
  });

  it("shows an explicit empty state instead of an empty page", async () => {
    vi.mocked(vetPanelService.listPatients).mockResolvedValue(page([]));

    renderWithIntl(<VetPatientRegistryView />);

    await waitFor(() => expect(screen.getByText("No patients found.")).toBeTruthy());
  });

  it("searches by the submitted query and navigates to the patient record", async () => {
    vi.mocked(vetPanelService.listPatients).mockResolvedValue(page([patient()]));

    renderWithIntl(<VetPatientRegistryView />);
    await waitFor(() => expect(screen.getByText("Luna")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "  Luna " } });
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(vetPanelService.listPatients).toHaveBeenCalledWith(expect.objectContaining({ q: "Luna", page: 1 })));

    fireEvent.click(screen.getByText("Luna"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/provider/patients/pet-1"));
  });
});
