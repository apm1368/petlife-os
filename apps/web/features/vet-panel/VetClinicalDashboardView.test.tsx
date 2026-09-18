import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { ClinicalDashboardDto, HospitalizationDto, WhiteboardPatientDto } from "@petlife/types";
import { vetPanelService } from "@/services/vet-panel.service";
import { VetClinicalDashboardView } from "./VetClinicalDashboardView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/vet-panel.service", () => ({ vetPanelService: { getDashboard: vi.fn() } }));

const HOSPITALIZATION: HospitalizationDto = {
  id: "hosp-1",
  petId: "pet-1",
  petName: "Milo",
  species: "CAT" as never,
  providerOrganizationId: "org-1",
  attendingProviderUserId: null,
  attendingProviderDisplayTitle: null,
  clinicalVisitId: null,
  status: "ADMITTED" as never,
  reasonForAdmission: "Post-operative monitoring",
  kennelLabel: "K3",
  triageLevel: "URGENT" as never,
  admittedAt: "2026-09-12T06:00:00.000Z",
  estimatedDischargeAt: null,
  dischargedAt: null,
  dischargeNote: null,
  cancelledReason: null,
  createdAt: "2026-09-12T06:00:00.000Z",
  updatedAt: "2026-09-12T06:00:00.000Z",
};

function dashboard(overrides: Partial<ClinicalDashboardDto> = {}): ClinicalDashboardDto {
  return {
    organizationId: "org-1",
    todaysVetBookingCount: 4,
    openVisits: [],
    whiteboard: [],
    overdueTreatmentTasks: [],
    pendingEstimates: [],
    unresolvedAlertCount: 0,
    dueFollowUps: [],
    ...overrides,
  };
}

function whiteboardRow(overrides: Partial<WhiteboardPatientDto> = {}): WhiteboardPatientDto {
  return { hospitalization: HOSPITALIZATION, dueTaskCount: 2, overdueTaskCount: 1, nextTaskAt: null, latestVitalsAt: null, ...overrides };
}

describe("VetClinicalDashboardView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(vetPanelService.getDashboard).mockReset();
  });

  it("says an inpatient has no vitals yet rather than implying they are stable", async () => {
    vi.mocked(vetPanelService.getDashboard).mockResolvedValue(dashboard({ whiteboard: [whiteboardRow()] }));

    renderWithIntl(<VetClinicalDashboardView />);

    await waitFor(() => expect(screen.getByText("Milo")).toBeTruthy());
    expect(screen.getByText("No vitals recorded yet")).toBeTruthy();
    expect(screen.getByText("Kennel K3")).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();
  });

  it("shows an explicit empty board rather than a blank screen", async () => {
    vi.mocked(vetPanelService.getDashboard).mockResolvedValue(dashboard());

    renderWithIntl(<VetClinicalDashboardView />);

    await waitFor(() => expect(screen.getByText("No patients are admitted.")).toBeTruthy());
    expect(screen.getByText("Nothing overdue.")).toBeTruthy();
    expect(screen.getByText("No estimates are waiting on an owner.")).toBeTruthy();
  });

  it("shows no revenue or productivity figure anywhere on the board", async () => {
    vi.mocked(vetPanelService.getDashboard).mockResolvedValue(dashboard({ whiteboard: [whiteboardRow()] }));

    const { container } = renderWithIntl(<VetClinicalDashboardView />);
    await waitFor(() => expect(screen.getByText("Milo")).toBeTruthy());

    const text = container.textContent ?? "";
    for (const word of ["Revenue", "revenue", "Toman", "IRR"]) {
      expect(text).not.toContain(word);
    }
  });
});
