import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import {
  HealthAttentionType,
  HealthSeverity,
  HomeActionKind,
  KnowledgeState,
  SetupStatus,
  VaccinationStatus,
  type HealthSummaryDto,
} from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthService } from "@/services/health.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthOverviewView } from "./HealthOverviewView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/health.service", () => ({ healthService: { getSummary: vi.fn(), listAllergies: vi.fn(async () => []), listConditions: vi.fn(async () => []), listMedications: vi.fn(async () => []) } }));
vi.mock("@/services/care-reminders.service", () => ({ careRemindersService: { list: vi.fn(async () => []) } }));
vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { getOverview: vi.fn() } }));

const BASE_SUMMARY: HealthSummaryDto = {
  status: SetupStatus.COMPLETE,
  allergyState: KnowledgeState.KNOWN_NEGATIVE,
  conditionsState: KnowledgeState.KNOWN_NEGATIVE,
  activeMedicationCount: 0,
  medicationsState: KnowledgeState.KNOWN_NEGATIVE,
  vaccinationStatus: VaccinationStatus.UP_TO_DATE,
  nextVaccinationDueAt: null,
  primaryAttention: null,
};

describe("HealthOverviewView", () => {
  beforeEach(() => {
    vi.mocked(healthService.getSummary).mockReset();
    vi.mocked(healthAdvancedService.getOverview).mockResolvedValue({ petId: "pet-1", upcomingCare: [], overdueCare: [], activeMedicationsCount: 0, unresolvedCarePlanItemsCount: 0, recentDocuments: [], recentVisits: [], missingInformation: [] });
  });

  it("shows a single primary-attention block, not a grid of equal cards, when something needs attention", async () => {
    vi.mocked(healthService.getSummary).mockResolvedValue({
      ...BASE_SUMMARY,
      vaccinationStatus: VaccinationStatus.DUE_SOON,
      primaryAttention: {
        type: HealthAttentionType.VACCINATION_DUE,
        severity: HealthSeverity.ATTENTION,
        titleKey: "health.attention.vaccinationDueSoon",
        action: HomeActionKind.VIEW_VACCINATION,
      },
    });

    renderWithIntl(<HealthOverviewView petId="pet-1" />);

    expect(await screen.findByText("Vaccination due soon.")).toBeTruthy();
  });

  it("falls back to a plain completeness message when nothing needs attention", async () => {
    vi.mocked(healthService.getSummary).mockResolvedValue(BASE_SUMMARY);

    renderWithIntl(<HealthOverviewView petId="pet-1" />);

    await waitFor(() => expect(screen.queryByText("Complete")).not.toBeNull());
    expect(screen.queryByText("Vaccination due soon.")).toBeNull();
    expect(screen.queryByText("Vaccination overdue.")).toBeNull();
  });

  it("never collapses Known Negative, Unknown, and Known Present allergy states into the same label", async () => {
    vi.mocked(healthService.getSummary).mockResolvedValue({
      ...BASE_SUMMARY,
      allergyState: KnowledgeState.UNKNOWN,
      conditionsState: KnowledgeState.UNKNOWN,
      medicationsState: KnowledgeState.UNKNOWN,
    });
    const { unmount } = renderWithIntl(<HealthOverviewView petId="pet-1" />);
    expect(await screen.findAllByText("Unknown")).toHaveLength(2); // allergies + conditions rows
    expect(screen.queryByText("None known")).toBeNull();
    unmount();

    vi.mocked(healthService.getSummary).mockResolvedValue({
      ...BASE_SUMMARY,
      allergyState: KnowledgeState.KNOWN_NEGATIVE,
      conditionsState: KnowledgeState.KNOWN_NEGATIVE,
      medicationsState: KnowledgeState.KNOWN_NEGATIVE,
    });
    renderWithIntl(<HealthOverviewView petId="pet-1" />);
    expect(await screen.findAllByText("None known")).toHaveLength(2);
    expect(screen.queryByText("Unknown")).toBeNull();
  });

  it("names what is on record — active allergies and medications — not just that something is recorded", async () => {
    vi.mocked(healthService.getSummary).mockResolvedValue({ ...BASE_SUMMARY, allergyState: KnowledgeState.KNOWN_PRESENT, activeMedicationCount: 1 });
    vi.mocked(healthService.listAllergies).mockResolvedValue([{ name: "Chicken protein", status: "ACTIVE" }, { name: "Old reaction", status: "RESOLVED" }] as never);
    vi.mocked(healthService.listMedications).mockResolvedValue([{ name: "Apoquel (oclacitinib)", status: "ACTIVE" }] as never);
    renderWithIntl(<HealthOverviewView petId="pet-1" />, "en");
    expect(await screen.findByText("Chicken protein")).toBeTruthy();
    expect(screen.queryByText(/Old reaction/)).toBeNull();
    expect(screen.getByText("Apoquel (oclacitinib)")).toBeTruthy();
  });
});
